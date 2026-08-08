const crypto = require('crypto');
const mongoose = require('mongoose');
const AppNotification = require('../models/AppNotification');
const Business = require('../models/Business');
const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const { getRazorpayClient, isRazorpayConfigured, razorpayMode } = require('../config/razorpay');

const clean = (value) => `${value ?? ''}`.trim();
const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const getBusiness = (ownerId) => Business.findOne({ ownerId }).select('_id ownerId businessName phone email');

const timingSafeEqual = (left, right) => {
  const a = Buffer.from(`${left || ''}`, 'utf8');
  const b = Buffer.from(`${right || ''}`, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const customerContact = (value) => {
  const digits = clean(value).replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return '';
};

const notify = async (payment, title, message, severity = 'success') => {
  try {
    await AppNotification.create({
      businessId: payment.businessId,
      ownerId: payment.ownerId,
      type: severity === 'success' ? 'payment_success' : 'payment_failed',
      severity,
      title,
      message,
      metadata: {
        invoiceNumber: payment.invoiceNumber,
        customerName: payment.customerName,
        paymentId: payment.razorpayPaymentId,
        amount: payment.amount,
      },
    });
  } catch (error) {
    console.error('Payment notification error:', error);
  }
};

const applyCapturedPayment = async (payment, providerPayment = {}) => {
  if (payment.appliedToInvoice) return payment;
  const locked = await Payment.findOneAndUpdate(
    { _id: payment._id, appliedToInvoice: false, applyingToInvoice: { $ne: true } },
    { $set: { applyingToInvoice: true } },
    { new: true },
  );
  if (!locked) return Payment.findById(payment._id);

  try {
    const invoice = await Invoice.findOne({
      _id: locked.invoiceId,
      businessId: locked.businessId,
      status: 'Active',
    });
    if (!invoice) throw new Error('The invoice linked to this payment is unavailable');

    const providerId = clean(providerPayment.id || locked.razorpayPaymentId);
    if (providerId && invoice.onlinePaymentIds?.includes(providerId)) {
      locked.appliedToInvoice = true;
      locked.applyingToInvoice = false;
      locked.status = 'Captured';
      await locked.save();
      return locked;
    }

    const received = providerPayment.amount ? money(Number(providerPayment.amount) / 100) : locked.amount;
    const applied = money(Math.min(received, invoice.balanceDue));
    if (applied > 0) {
      invoice.paidAmount = money(invoice.paidAmount + applied);
      invoice.balanceDue = money(Math.max(0, invoice.total - invoice.paidAmount));
      invoice.paymentStatus = invoice.balanceDue <= 0 ? 'Paid' : 'Partial';
      invoice.paymentMethod = 'Razorpay';
      invoice.onlinePaymentIds = [...new Set([...(invoice.onlinePaymentIds || []), providerId].filter(Boolean))];
      invoice.lastPaymentAt = new Date();
      await invoice.save();
      await Customer.updateOne(
        { _id: invoice.customerId, businessId: locked.businessId },
        { $inc: { outstandingBalance: -applied } },
      );
    }

    locked.status = 'Captured';
    locked.razorpayPaymentId = providerId;
    locked.razorpayOrderId = clean(providerPayment.order_id || locked.razorpayOrderId);
    locked.method = clean(providerPayment.method || locked.method);
    locked.email = clean(providerPayment.email || locked.email);
    locked.contact = clean(providerPayment.contact || locked.contact);
    locked.appliedAmount = applied;
    locked.appliedToInvoice = true;
    locked.applyingToInvoice = false;
    locked.paidAt = locked.paidAt || new Date();
    await locked.save();

    await notify(
      locked,
      `Payment received • ${locked.invoiceNumber}`,
      `${locked.customerName} paid ₹${applied.toFixed(2)} through the shared Razorpay link.`,
    );
    return locked;
  } catch (error) {
    await Payment.updateOne({ _id: locked._id }, { $set: { applyingToInvoice: false } });
    throw error;
  }
};

const createPaymentLink = async (req, res) => {
  try {
    if (!isRazorpayConfigured()) {
      return res.status(503).json({ message: 'Razorpay is not configured on the backend' });
    }
    if (!mongoose.isValidObjectId(req.params.invoiceId)) {
      return res.status(400).json({ message: 'Invalid invoice ID' });
    }
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const invoice = await Invoice.findOne({
      _id: req.params.invoiceId,
      businessId: business._id,
      status: 'Active',
    });
    if (!invoice) return res.status(404).json({ message: 'Active invoice not found' });
    if (invoice.balanceDue <= 0) return res.status(409).json({ message: 'This invoice is already fully paid' });

    const amount = money(req.body.amount === undefined ? invoice.balanceDue : req.body.amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > invoice.balanceDue) {
      return res.status(400).json({ message: 'Link amount must be at least ₹1 and cannot exceed the balance due' });
    }
    const amountPaise = Math.round(amount * 100);

    // Reuse the same still-valid link to prevent accidental duplicate links.
    const existing = await Payment.findOne({
      businessId: business._id,
      invoiceId: invoice._id,
      amountPaise,
      status: 'LinkIssued',
      paymentLinkUrl: { $ne: '' },
      $or: [{ expireAt: null }, { expireAt: { $gt: new Date() } }],
    }).sort({ createdAt: -1 });
    if (existing) {
      return res.json({
        message: 'Existing payment link is ready to share',
        payment: existing,
        link: existing.paymentLinkUrl,
        mode: razorpayMode(),
      });
    }

    const olderLinks = await Payment.find({
      businessId: business._id,
      invoiceId: invoice._id,
      status: 'LinkIssued',
      razorpayPaymentLinkId: { $ne: '' },
    });
    for (const older of olderLinks) {
      try {
        await getRazorpayClient().paymentLink.cancel(older.razorpayPaymentLinkId);
        older.status = 'Cancelled';
        await older.save();
      } catch (cancelError) {
        console.error('Cancel older payment link error:', cancelError);
        return res.status(409).json({
          message: 'An older payment link is still active. Check its status in Razorpay before generating a new link.',
        });
      }
    }

    const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const referenceId = `wp_${String(invoice._id).slice(-12)}_${Date.now()}`.slice(0, 40);
    const customer = {
      name: clean(invoice.customerSnapshot?.name) || 'Customer',
      ...(clean(invoice.customerSnapshot?.email) ? { email: clean(invoice.customerSnapshot.email) } : {}),
      ...(customerContact(invoice.customerSnapshot?.phone) ? { contact: customerContact(invoice.customerSnapshot.phone) } : {}),
    };

    const link = await getRazorpayClient().paymentLink.create({
      amount: amountPaise,
      currency: 'INR',
      accept_partial: false,
      description: `Payment for ${invoice.invoiceNumber} to ${business.businessName}`.slice(0, 255),
      reference_id: referenceId,
      customer,
      notify: { sms: false, email: false },
      reminder_enable: false,
      expire_by: Math.floor(expireAt.getTime() / 1000),
      notes: {
        workpilot_invoice_id: String(invoice._id),
        invoice_number: invoice.invoiceNumber,
        business_id: String(business._id),
      },
    });

    const payment = await Payment.create({
      businessId: business._id,
      ownerId: req.userId,
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      invoiceNumber: invoice.invoiceNumber,
      customerName: customer.name,
      amount,
      amountPaise,
      razorpayPaymentLinkId: link.id,
      // Keeps compatibility with the unique razorpayOrderId index created by
      // the earlier checkout implementation. The webhook replaces it with the
      // real Razorpay order ID after the customer pays.
      razorpayOrderId: link.id,
      paymentLinkUrl: link.short_url,
      status: 'LinkIssued',
      expireAt,
    });
    return res.status(201).json({
      message: 'Payment link generated successfully',
      payment,
      link: payment.paymentLinkUrl,
      mode: razorpayMode(),
    });
  } catch (error) {
    console.error('Create payment link error:', error);
    return res.status(500).json({ message: error.error?.description || error.message || 'Unable to generate payment link' });
  }
};

const listPayments = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const filter = { businessId: business._id };
    const accepted = ['LinkIssued', 'Created', 'Authorized', 'Captured', 'Failed', 'Expired', 'Cancelled', 'Refunded'];
    if (accepted.includes(req.query.status)) filter.status = req.query.status;
    const search = clean(req.query.search);
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ invoiceNumber: regex }, { customerName: regex }, { razorpayPaymentId: regex }];
    }
    const [payments, rows] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).limit(250).lean(),
      Payment.aggregate([
        { $match: { businessId: business._id } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ]);
    const summary = Object.fromEntries(rows.map((row) => [row._id, row]));
    return res.json({
      payments,
      summary: {
        capturedAmount: money(summary.Captured?.amount),
        capturedCount: summary.Captured?.count || 0,
        pendingCount: (summary.LinkIssued?.count || 0) + (summary.Created?.count || 0) + (summary.Authorized?.count || 0),
        failedCount: (summary.Failed?.count || 0) + (summary.Expired?.count || 0),
      },
      mode: razorpayMode(),
      configured: isRazorpayConfigured(),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load payment history' });
  }
};

const getPayment = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    const payment = business && mongoose.isValidObjectId(req.params.id)
      ? await Payment.findOne({ _id: req.params.id, businessId: business._id }).lean()
      : null;
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    return res.json({ payment });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load payment' });
  }
};

const handleWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    if (!secret) return res.status(503).json({ message: 'Webhook secret is not configured' });
    if (!req.rawBody || !signature) return res.status(400).json({ message: 'Invalid webhook request' });
    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    if (!timingSafeEqual(expected, signature)) return res.status(400).json({ message: 'Invalid webhook signature' });

    const eventId = clean(req.headers['x-razorpay-event-id']);
    const event = clean(req.body?.event);
    const paymentEntity = req.body?.payload?.payment?.entity || {};
    const linkEntity = req.body?.payload?.payment_link?.entity || {};
    const linkId = clean(linkEntity.id || paymentEntity.payment_link_id);
    const orderId = clean(paymentEntity.order_id);
    const notesInvoiceId = clean(paymentEntity.notes?.workpilot_invoice_id || linkEntity.notes?.workpilot_invoice_id);

    let payment = null;
    if (linkId) payment = await Payment.findOne({ razorpayPaymentLinkId: linkId });
    if (!payment && orderId) payment = await Payment.findOne({ razorpayOrderId: orderId });
    if (!payment && mongoose.isValidObjectId(notesInvoiceId)) {
      payment = await Payment.findOne({ invoiceId: notesInvoiceId, status: 'LinkIssued' }).sort({ createdAt: -1 });
    }
    if (!payment) return res.json({ received: true });
    if (eventId && payment.webhookEventIds.includes(eventId)) return res.json({ received: true, duplicate: true });

    if (eventId) payment.webhookEventIds.push(eventId);
    payment.razorpayOrderId = orderId || payment.razorpayOrderId;
    payment.razorpayPaymentId = clean(paymentEntity.id || payment.razorpayPaymentId);
    payment.method = clean(paymentEntity.method || payment.method);
    payment.email = clean(paymentEntity.email || payment.email);
    payment.contact = clean(paymentEntity.contact || payment.contact);

    if (event === 'payment_link.paid' || event === 'payment.captured') {
      await payment.save();
      await applyCapturedPayment(payment, paymentEntity);
    } else if (event === 'payment.authorized' && payment.status !== 'Captured') {
      payment.status = 'Authorized';
      await payment.save();
    } else if (event === 'payment.failed' && payment.status !== 'Captured') {
      payment.status = 'Failed';
      payment.errorCode = clean(paymentEntity.error_code);
      payment.errorDescription = clean(paymentEntity.error_description).slice(0, 500);
      payment.failedAt = new Date();
      await payment.save();
      await notify(payment, `Payment failed • ${payment.invoiceNumber}`, payment.errorDescription || 'The customer payment failed.', 'warning');
    } else if (event === 'payment_link.expired' && payment.status !== 'Captured') {
      payment.status = 'Expired';
      await payment.save();
    } else if (event === 'payment_link.cancelled' && payment.status !== 'Captured') {
      payment.status = 'Cancelled';
      await payment.save();
    } else {
      await payment.save();
    }
    return res.json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook error:', error);
    return res.status(500).json({ message: 'Webhook processing failed' });
  }
};

module.exports = { createPaymentLink, listPayments, getPayment, handleWebhook };
