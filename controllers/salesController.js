const mongoose = require('mongoose');
const Business = require('../models/Business');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const InvoiceCounter = require('../models/InvoiceCounter');
const {
  notifyForStockTransition,
  stockState,
} = require('../services/inventoryNotificationService');
const { recordActivity } = require('../services/activityService');

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const cleanText = (value) => `${value ?? ''}`.trim();
const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getBusiness = (ownerId) => Business.findOne({ ownerId }).select(
  '_id ownerId businessName businessType phone email addressLine1 addressLine2 city state pincode gstin pan bank invoiceSettings',
);

const paymentStatusFor = (total, paid) => {
  if (paid >= total) return 'Paid';
  return paid > 0 ? 'Partial' : 'Pending';
};

const rollbackStock = async (changes) => {
  for (const change of changes.reverse()) {
    await Product.updateOne({ _id: change.productId }, { $inc: { quantity: change.quantity } });
  }
};

const nextInvoiceNumber = async (business) => {
  const counter = await InvoiceCounter.findOneAndUpdate(
    { businessId: business._id },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  const now = new Date();
  const year = now.getFullYear();
  const prefix = cleanText(business.invoiceSettings?.prefix || 'INV').toUpperCase();
  return `${prefix}-${year}-${String(counter.sequence).padStart(5, '0')}`;
};

const buildFilter = (businessId, query) => {
  const filter = { businessId };
  const search = cleanText(query.search);
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [
      { invoiceNumber: expression },
      { 'customerSnapshot.name': expression },
      { 'customerSnapshot.phone': expression },
    ];
  }
  if (['Paid', 'Partial', 'Pending'].includes(query.paymentStatus)) {
    filter.paymentStatus = query.paymentStatus;
  }
  if (['Active', 'Cancelled'].includes(query.status)) filter.status = query.status;
  if (query.from || query.to) {
    filter.invoiceDate = {};
    if (query.from) {
      const from = new Date(query.from);
      if (!Number.isNaN(from.getTime())) filter.invoiceDate.$gte = from;
    }
    if (query.to) {
      const to = new Date(query.to);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        filter.invoiceDate.$lte = to;
      }
    }
    if (Object.keys(filter.invoiceDate).length === 0) delete filter.invoiceDate;
  }
  return filter;
};

const listInvoices = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const invoices = await Invoice.find(buildFilter(business._id, req.query))
      .sort({ invoiceDate: -1, createdAt: -1 })
      .limit(250)
      .lean();
    return res.json({ invoices });
  } catch (error) {
    console.error('List invoices error:', error);
    return res.status(500).json({ message: 'Unable to load invoices' });
  }
};

const getInvoice = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid invoice ID' });
    }
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const invoice = await Invoice.findOne({ _id: req.params.id, businessId: business._id }).lean();
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    return res.json({ invoice });
  } catch (error) {
    console.error('Get invoice error:', error);
    return res.status(500).json({ message: 'Unable to load invoice' });
  }
};

const getCustomerInvoices = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.customerId)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const invoices = await Invoice.find({
      businessId: business._id,
      customerId: req.params.customerId,
    }).sort({ invoiceDate: -1 }).limit(100).lean();
    return res.json({ invoices });
  } catch (error) {
    console.error('Customer invoices error:', error);
    return res.status(500).json({ message: 'Unable to load purchase history' });
  }
};

const getSalesSummary = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);

    const [totals] = await Invoice.aggregate([
      { $match: { businessId: business._id, status: 'Active' } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          totalPaid: { $sum: '$paidAmount' },
          totalOutstanding: { $sum: '$balanceDue' },
          totalProfit: { $sum: '$grossProfit' },
          invoiceCount: { $sum: 1 },
          todaySales: { $sum: { $cond: [{ $gte: ['$invoiceDate', today] }, '$total', 0] } },
          monthSales: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$invoiceDate', monthStart] }, { $lt: ['$invoiceDate', monthEnd] }] },
                '$total',
                0,
              ],
            },
          },
          monthGrossProfit: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$invoiceDate', monthStart] }, { $lt: ['$invoiceDate', monthEnd] }] },
                '$grossProfit',
                0,
              ],
            },
          },
        },
      },
    ]);

    const daily = await Invoice.aggregate([
      { $match: { businessId: business._id, status: 'Active', invoiceDate: { $gte: weekStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } },
          amount: { $sum: '$total' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const dailyMap = new Map(daily.map((entry) => [entry._id, entry.amount]));
    const last7Days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, amount: roundMoney(dailyMap.get(key) || 0) };
    });

    return res.json({
      summary: totals || {
        totalSales: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        totalProfit: 0,
        invoiceCount: 0,
        todaySales: 0,
        monthSales: 0,
        monthGrossProfit: 0,
      },
      last7Days,
    });
  } catch (error) {
    console.error('Sales summary error:', error);
    return res.status(500).json({ message: 'Unable to load sales summary' });
  }
};

const createInvoice = async (req, res) => {
  const stockChanges = [];
  let createdInvoice = null;
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    if (!mongoose.isValidObjectId(req.body.customerId)) {
      return res.status(400).json({ message: 'Select a valid customer' });
    }

    const customer = await Customer.findOne({
      _id: req.body.customerId,
      businessId: business._id,
      isActive: true,
    });
    if (!customer) return res.status(404).json({ message: 'Active customer not found' });

    const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
    const consolidated = new Map();
    for (const item of requestedItems) {
      const productId = cleanText(item.productId);
      const quantity = Math.floor(asNumber(item.quantity));
      if (!mongoose.isValidObjectId(productId) || quantity < 1) {
        return res.status(400).json({ message: 'Every invoice item requires a valid product and quantity' });
      }
      consolidated.set(productId, (consolidated.get(productId) || 0) + quantity);
    }
    if (consolidated.size === 0) {
      return res.status(400).json({ message: 'Add at least one product to the invoice' });
    }

    const products = await Product.find({
      _id: { $in: [...consolidated.keys()] },
      businessId: business._id,
      ownerId: req.userId,
      isActive: true,
    });
    if (products.length !== consolidated.size) {
      return res.status(400).json({ message: 'One or more products are unavailable' });
    }

    const items = [];
    let subtotal = 0;
    let totalCost = 0;
    for (const product of products) {
      const quantity = consolidated.get(String(product._id));
      if (product.quantity < quantity) {
        return res.status(409).json({
          message: `${product.name} has only ${product.quantity} ${product.unit} available`,
        });
      }
      const lineTotal = roundMoney(product.sellingPrice * quantity);
      items.push({
        productId: product._id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        quantity,
        unitPrice: roundMoney(product.sellingPrice),
        costPrice: roundMoney(product.costPrice),
        lineTotal,
      });
      subtotal += lineTotal;
      totalCost += product.costPrice * quantity;
    }
    subtotal = roundMoney(subtotal);
    totalCost = roundMoney(totalCost);

    const discountType = req.body.discountType === 'fixed' ? 'fixed' : 'percent';
    const discountValue = asNumber(req.body.discountValue);
    if (discountValue < 0 || (discountType === 'percent' && discountValue > 100)) {
      return res.status(400).json({ message: 'Enter a valid discount' });
    }
    const discountAmount = roundMoney(
      discountType === 'percent' ? subtotal * discountValue / 100 : discountValue,
    );
    if (discountAmount > subtotal) {
      return res.status(400).json({ message: 'Discount cannot exceed the subtotal' });
    }
    const taxableAmount = roundMoney(subtotal - discountAmount);
    const taxPercent = asNumber(req.body.taxPercent);
    if (taxPercent < 0 || taxPercent > 100) {
      return res.status(400).json({ message: 'Tax percentage must be between 0 and 100' });
    }
    const taxAmount = roundMoney(taxableAmount * taxPercent / 100);
    const total = roundMoney(taxableAmount + taxAmount);
    const paidAmount = roundMoney(asNumber(req.body.paidAmount));
    if (paidAmount < 0 || paidAmount > total) {
      return res.status(400).json({ message: 'Paid amount must be between zero and the invoice total' });
    }
    const balanceDue = roundMoney(total - paidAmount);
    if (
      customer.creditLimit > 0 &&
      roundMoney(customer.outstandingBalance + balanceDue) > customer.creditLimit
    ) {
      return res.status(409).json({
        message: `This sale exceeds ${customer.name}'s credit limit`,
      });
    }

    for (const product of products) {
      const quantity = consolidated.get(String(product._id));
      const previousState = stockState(product);
      const updated = await Product.findOneAndUpdate(
        {
          _id: product._id,
          businessId: business._id,
          ownerId: req.userId,
          isActive: true,
          quantity: { $gte: quantity },
        },
        { $inc: { quantity: -quantity } },
        { new: true },
      );
      if (!updated) {
        await rollbackStock(stockChanges);
        return res.status(409).json({ message: `${product.name} stock changed. Please review the invoice.` });
      }
      stockChanges.push({ productId: product._id, quantity, previousState, updated });
    }

    const invoiceNumber = await nextInvoiceNumber(business);
    const invoiceDate = req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date();
    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    createdInvoice = await Invoice.create({
      businessId: business._id,
      ownerId: req.userId,
      customerId: customer._id,
      invoiceNumber,
      invoiceDate: Number.isNaN(invoiceDate.getTime()) ? new Date() : invoiceDate,
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      customerSnapshot: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        city: customer.city,
      },
      businessSnapshot: {
        name: business.businessName,
        phone: business.phone,
        businessType: business.businessType,
        email: business.email,
        addressLine1: business.addressLine1,
        addressLine2: business.addressLine2,
        city: business.city,
        state: business.state,
        pincode: business.pincode,
        gstin: business.gstin,
        pan: business.pan,
        bank: business.bank,
        invoiceSettings: {
          taxLabel: business.invoiceSettings?.taxLabel || 'GST',
          terms: business.invoiceSettings?.terms || '',
          footerNote: business.invoiceSettings?.footerNote || 'Thank you for your business.',
          accentColor: business.invoiceSettings?.accentColor || '#2563EB',
          showLogo: business.invoiceSettings?.showLogo !== false,
          showSignature: business.invoiceSettings?.showSignature !== false,
          signatureLabel: business.invoiceSettings?.signatureLabel || 'Authorized Signatory',
        },
      },
      items,
      subtotal,
      discountType,
      discountValue: roundMoney(discountValue),
      discountAmount,
      taxPercent: roundMoney(taxPercent),
      taxAmount,
      total,
      totalCost,
      grossProfit: roundMoney(total - taxAmount - totalCost),
      paidAmount,
      balanceDue,
      paymentStatus: paymentStatusFor(total, paidAmount),
      paymentMethod: ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'].includes(req.body.paymentMethod)
        ? req.body.paymentMethod
        : 'Cash',
      notes: cleanText(req.body.notes),
    });

    await Customer.updateOne(
      { _id: customer._id, businessId: business._id },
      {
        $inc: { totalPurchases: total, purchaseCount: 1, outstandingBalance: balanceDue },
        $set: { lastPurchaseAt: createdInvoice.invoiceDate },
      },
    );

    for (const change of stockChanges) {
      try {
        await notifyForStockTransition({
          product: change.updated,
          previousState: change.previousState,
        });
      } catch (notificationError) {
        console.error('Sale stock notification error:', notificationError);
      }
    }

    await recordActivity({
      businessId: business._id, ownerId: req.userId, type: 'invoice_created', category: 'Sales',
      title: `Invoice ${createdInvoice.invoiceNumber} created`,
      description: `${customer.name} • ${createdInvoice.items.length} item(s)`, amount: createdInvoice.total,
      entityType: 'Invoice', entityId: createdInvoice._id, route: '/sales',
    });

    return res.status(201).json({ message: 'Invoice created successfully', invoice: createdInvoice });
  } catch (error) {
    if (createdInvoice) await Invoice.deleteOne({ _id: createdInvoice._id });
    if (stockChanges.length > 0) await rollbackStock(stockChanges);
    console.error('Create invoice error:', error);
    return res.status(500).json({ message: 'Unable to create invoice. Stock changes were reversed.' });
  }
};

const collectPayment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid invoice ID' });
    }
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const invoice = await Invoice.findOne({ _id: req.params.id, businessId: business._id });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    if (invoice.status === 'Cancelled') {
      return res.status(409).json({ message: 'A cancelled invoice cannot receive payment' });
    }
    const amount = roundMoney(asNumber(req.body.amount));
    if (amount <= 0 || amount > invoice.balanceDue) {
      return res.status(400).json({ message: 'Enter an amount up to the current balance due' });
    }

    invoice.paidAmount = roundMoney(invoice.paidAmount + amount);
    invoice.balanceDue = roundMoney(invoice.total - invoice.paidAmount);
    invoice.paymentStatus = paymentStatusFor(invoice.total, invoice.paidAmount);
    if (['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'].includes(req.body.paymentMethod)) {
      invoice.paymentMethod = req.body.paymentMethod;
    }
    await invoice.save();
    await Customer.updateOne(
      { _id: invoice.customerId, businessId: business._id },
      { $inc: { outstandingBalance: -amount } },
    );
    await recordActivity({
      businessId: business._id, ownerId: req.userId, type: 'payment_received', category: 'Sales',
      title: `Payment received for ${invoice.invoiceNumber}`,
      description: `${invoice.customerSnapshot?.name || 'Customer'} • ${invoice.paymentMethod}`,
      amount, entityType: 'Invoice', entityId: invoice._id, route: '/sales',
    });
    return res.json({ message: 'Payment recorded successfully', invoice });
  } catch (error) {
    console.error('Collect payment error:', error);
    return res.status(500).json({ message: 'Unable to record payment' });
  }
};

const cancelInvoice = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid invoice ID' });
    }
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const invoice = await Invoice.findOne({ _id: req.params.id, businessId: business._id });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    if (invoice.status === 'Cancelled') {
      return res.status(409).json({ message: 'Invoice is already cancelled' });
    }

    const restored = [];
    for (const item of invoice.items) {
      const product = await Product.findOne({
        _id: item.productId,
        businessId: business._id,
        ownerId: req.userId,
      });
      if (!product) continue;
      const previousState = stockState(product);
      product.quantity += item.quantity;
      await product.save();
      restored.push({ product, previousState });
    }

    invoice.status = 'Cancelled';
    invoice.cancelledAt = new Date();
    invoice.cancellationReason = cleanText(req.body.reason) || 'Cancelled by business owner';
    await invoice.save();

    await Customer.updateOne(
      { _id: invoice.customerId, businessId: business._id },
      {
        $inc: {
          totalPurchases: -invoice.total,
          purchaseCount: -1,
          outstandingBalance: -invoice.balanceDue,
        },
      },
    );

    for (const change of restored) {
      try {
        await notifyForStockTransition({ product: change.product, previousState: change.previousState });
      } catch (notificationError) {
        console.error('Cancellation stock notification error:', notificationError);
      }
    }

    await recordActivity({
      businessId: business._id, ownerId: req.userId, type: 'invoice_cancelled', category: 'Sales',
      title: `Invoice ${invoice.invoiceNumber} cancelled`, description: invoice.cancellationReason,
      amount: invoice.total, entityType: 'Invoice', entityId: invoice._id, route: '/sales',
    });

    return res.json({
      message: invoice.paidAmount > 0
        ? `Invoice cancelled. Remember to refund ${invoice.paidAmount.toFixed(2)} to the customer.`
        : 'Invoice cancelled and stock restored',
      invoice,
    });
  } catch (error) {
    console.error('Cancel invoice error:', error);
    return res.status(500).json({ message: 'Unable to cancel invoice' });
  }
};

module.exports = {
  listInvoices,
  getSalesSummary,
  getInvoice,
  getCustomerInvoices,
  createInvoice,
  collectPayment,
  cancelInvoice,
};
