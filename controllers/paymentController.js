const crypto = require('crypto');
const mongoose = require('mongoose');
const AppNotification = require('../models/AppNotification');
const Business = require('../models/Business');
const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const { getRazorpayClient, isRazorpayConfigured, razorpayMode } = require('../config/razorpay');
const { recordActivity } = require('../services/activityService');

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const safeText = (value) => `${value ?? ''}`.trim();

const getBusiness = (ownerId) => Business.findOne({ ownerId }).select(
  '_id ownerId businessName phone email',
);

const timingSafeHexEqual = (left, right) => {
  const a = Buffer.from(`${left || ''}`, 'utf8');
  const b = Buffer.from(`${right || ''}`, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const notify = async ({ payment, type, severity, title, message }) => {
  try {
    await AppNotification.create({
      businessId: payment.businessId,
      ownerId: payment.ownerId,
      type,
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
  payment = locked;

  try {

  const invoice = await Invoice.findOne({
    _id: payment.invoiceId,
    businessId: payment.businessId,
    status: 'Active',
  });
  if (!invoice) throw new Error('The invoice linked to this payment is unavailable');

  if (invoice.onlinePaymentIds?.includes(payment.razorpayPaymentId)) {
    payment.appliedToInvoice = true;
    payment.applyingToInvoice = false;
    payment.appliedAmount = Math.min(payment.amount, invoice.total);
    await payment.save();
    return payment;
  }

  const appliedAmount = roundMoney(Math.min(payment.amount, invoice.balanceDue));
  if (appliedAmount <= 0) {
    payment.status = 'Captured';
    payment.appliedToInvoice = true;
    payment.applyingToInvoice = false;
    payment.appliedAmount = 0;
    payment.paidAt = payment.paidAt || new Date();
    await payment.save();
    return payment;
  }

  invoice.paidAmount = roundMoney(invoice.paidAmount + appliedAmount);
  invoice.balanceDue = roundMoney(Math.max(0, invoice.total - invoice.paidAmount));
  invoice.paymentStatus = invoice.balanceDue <= 0 ? 'Paid' : 'Partial';
  invoice.paymentMethod = 'Razorpay';
  invoice.onlinePaymentIds = [...new Set([
    ...(invoice.onlinePaymentIds || []),
    payment.razorpayPaymentId,
  ])];
  invoice.lastPaymentAt = new Date();
  await invoice.save();

  await Customer.updateOne(
    { _id: invoice.customerId, businessId: payment.businessId },
    { $inc: { outstandingBalance: -appliedAmount } },
  );

  payment.status = 'Captured';
  payment.method = safeText(providerPayment.method || payment.method);
  payment.email = safeText(providerPayment.email || payment.email);
  payment.contact = safeText(providerPayment.contact || payment.contact);
  payment.appliedToInvoice = true;
  payment.applyingToInvoice = false;
  payment.appliedAmount = appliedAmount;
  payment.paidAt = payment.paidAt || new Date();
  await payment.save();

  await notify({
    payment,
    type: 'payment_success',
    severity: 'success',
    title: `Online payment received • ${invoice.invoiceNumber}`,
    message: `${payment.customerName} paid ₹${appliedAmount.toFixed(2)} using Razorpay.`,
  });
  await recordActivity({
    businessId: payment.businessId,
    ownerId: payment.ownerId,
    type: 'payment_received',
    category: 'Sales',
    title: `Online payment received for ${invoice.invoiceNumber}`,
    description: `${payment.customerName} • Razorpay${payment.method ? ` • ${payment.method}` : ''}`,
    amount: appliedAmount,
    entityType: 'Invoice',
    entityId: invoice._id,
    route: '/payments',
    metadata: { paymentId: payment.razorpayPaymentId, orderId: payment.razorpayOrderId },
  });

  return payment;
  } catch (error) {
    await Payment.updateOne(
      { _id: payment._id, appliedToInvoice: false },
      { $set: { applyingToInvoice: false } },
    );
    throw error;
  }
};

const createOrder = async (req, res) => {
  try {
    if (!isRazorpayConfigured()) {
      return res.status(503).json({ message: 'Razorpay is not configured. Add the Test Mode keys to the backend .env file.' });
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

    const requestedAmount = req.body.amount === undefined ? invoice.balanceDue : Number(req.body.amount);
    const amount = roundMoney(requestedAmount);
    if (!Number.isFinite(amount) || amount < 1 || amount > invoice.balanceDue) {
      return res.status(400).json({ message: 'Online payment must be at least ₹1 and cannot exceed the balance due' });
    }
    const amountPaise = Math.round(amount * 100);
    const receipt = `wp_${String(invoice._id).slice(-12)}_${Date.now()}`.slice(0, 40);
    const order = await getRazorpayClient().orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
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
      customerName: invoice.customerSnapshot?.name || 'Customer',
      amount,
      amountPaise,
      razorpayOrderId: order.id,
      status: 'Created',
    });

    return res.status(201).json({
      message: 'Secure payment order created',
      paymentId: payment._id,
      checkout: {
        key: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: amountPaise,
        currency: 'INR',
        businessName: business.businessName,
        description: `Payment for ${invoice.invoiceNumber}`,
        customerName: invoice.customerSnapshot?.name || '',
        customerEmail: invoice.customerSnapshot?.email || '',
        customerPhone: invoice.customerSnapshot?.phone || '',
        mode: razorpayMode(),
      },
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    return res.status(500).json({ message: error.error?.description || error.message || 'Unable to start online payment' });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const orderId = safeText(req.body.razorpayOrderId);
    const providerPaymentId = safeText(req.body.razorpayPaymentId);
    const signature = safeText(req.body.razorpaySignature);
    if (!orderId || !providerPaymentId || !signature) {
      return res.status(400).json({ message: 'Incomplete Razorpay payment response' });
    }
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const payment = await Payment.findOne({ razorpayOrderId: orderId, businessId: business._id });
    if (!payment) return res.status(404).json({ message: 'Payment order not found' });

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${providerPaymentId}`)
      .digest('hex');
    if (!timingSafeHexEqual(expected, signature)) {
      return res.status(400).json({ message: 'Payment signature verification failed' });
    }

    let remote = await getRazorpayClient().payments.fetch(providerPaymentId);
    if (remote.order_id !== orderId || Number(remote.amount) !== payment.amountPaise) {
      return res.status(400).json({ message: 'Razorpay payment details do not match this order' });
    }
    payment.razorpayPaymentId = providerPaymentId;
    payment.method = safeText(remote.method);
    payment.email = safeText(remote.email);
    payment.contact = safeText(remote.contact);

    if (remote.status === 'authorized') {
      payment.status = 'Authorized';
      await payment.save();
      try {
        remote = await getRazorpayClient().payments.capture(providerPaymentId, payment.amountPaise, 'INR');
      } catch (captureError) {
        console.error('Razorpay capture pending:', captureError);
      }
    }

    if (remote.status !== 'captured') {
      await payment.save();
      return res.status(202).json({
        message: 'Payment is authorized and awaiting capture. WorkPilot will update it through the webhook.',
        payment,
      });
    }

    await payment.save();
    const capturedPayment = await applyCapturedPayment(payment, remote);
    const invoice = await Invoice.findById(payment.invoiceId).lean();
    return res.json({ message: 'Online payment verified successfully', payment: capturedPayment, invoice });
  } catch (error) {
    console.error('Verify Razorpay payment error:', error);
    return res.status(500).json({ message: error.message || 'Unable to verify online payment' });
  }
};

const recordFailure = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const payment = await Payment.findOne({
      razorpayOrderId: safeText(req.body.razorpayOrderId),
      businessId: business._id,
    });
    if (!payment) return res.status(404).json({ message: 'Payment order not found' });
    if (!['Captured', 'Failed', 'Refunded'].includes(payment.status)) {
      payment.status = 'Failed';
      payment.errorCode = safeText(req.body.code);
      payment.errorDescription = safeText(req.body.message).slice(0, 500);
      payment.failedAt = new Date();
      await payment.save();
      await notify({
        payment,
        type: 'payment_failed',
        severity: 'warning',
        title: `Online payment failed • ${payment.invoiceNumber}`,
        message: payment.errorDescription || 'The Razorpay checkout was not completed.',
      });
    }
    return res.json({ message: 'Payment attempt updated' });
  } catch (error) {
    console.error('Record payment failure error:', error);
    return res.status(500).json({ message: 'Unable to update payment attempt' });
  }
};

const listPayments = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const filter = { businessId: business._id };
    if (['Created', 'Authorized', 'Captured', 'Failed', 'Refunded'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const search = safeText(req.query.search);
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ invoiceNumber: regex }, { customerName: regex }, { razorpayPaymentId: regex }];
    }
    const [payments, rows] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).limit(250).lean(),
      Payment.aggregate([
        { $match: { businessId: business._id } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ]);
    const byStatus = Object.fromEntries(rows.map((row) => [row._id, { count: row.count, amount: roundMoney(row.amount) }]));
    return res.json({
      payments,
      summary: {
        capturedAmount: byStatus.Captured?.amount || 0,
        capturedCount: byStatus.Captured?.count || 0,
        pendingCount: (byStatus.Created?.count || 0) + (byStatus.Authorized?.count || 0),
        failedCount: byStatus.Failed?.count || 0,
      },
      mode: razorpayMode(),
      configured: isRazorpayConfigured(),
    });
  } catch (error) {
    console.error('List payments error:', error);
    return res.status(500).json({ message: 'Unable to load payment history' });
  }
};

const getPayment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid payment ID' });
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const payment = await Payment.findOne({ _id: req.params.id, businessId: business._id }).lean();
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    return res.json({ payment });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load payment' });
  }
};

const handleWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ message: 'Webhook secret is not configured' });
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody;
    if (!rawBody || !signature) return res.status(400).json({ message: 'Invalid webhook request' });
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!timingSafeHexEqual(expected, signature)) {
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    const eventId = safeText(req.headers['x-razorpay-event-id']);
    const event = safeText(req.body?.event);
    const entity = req.body?.payload?.payment?.entity || {};
    const orderId = safeText(entity.order_id);
    if (!orderId) return res.json({ received: true });
    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    if (!payment) return res.json({ received: true });
    if (eventId && payment.webhookEventIds.includes(eventId)) return res.json({ received: true, duplicate: true });

    if (eventId) payment.webhookEventIds.push(eventId);
    payment.razorpayPaymentId = safeText(entity.id || payment.razorpayPaymentId);
    payment.method = safeText(entity.method || payment.method);
    payment.email = safeText(entity.email || payment.email);
    payment.contact = safeText(entity.contact || payment.contact);

    if (event === 'payment.captured') {
      await payment.save();
      await applyCapturedPayment(payment, entity);
    } else if (event === 'payment.authorized' && payment.status !== 'Captured') {
      payment.status = 'Authorized';
      await payment.save();
    } else if (event === 'payment.failed' && payment.status !== 'Captured') {
      payment.status = 'Failed';
      payment.errorCode = safeText(entity.error_code);
      payment.errorDescription = safeText(entity.error_description).slice(0, 500);
      payment.failedAt = new Date();
      await payment.save();
      await notify({
        payment,
        type: 'payment_failed',
        severity: 'warning',
        title: `Online payment failed • ${payment.invoiceNumber}`,
        message: payment.errorDescription || 'The Razorpay payment failed.',
      });
    } else {
      await payment.save();
    }
    return res.json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook error:', error);
    return res.status(500).json({ message: 'Webhook processing failed' });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  recordFailure,
  listPayments,
  getPayment,
  handleWebhook,
};
