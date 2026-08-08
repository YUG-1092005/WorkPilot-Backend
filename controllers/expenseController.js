const mongoose = require('mongoose');
const Business = require('../models/Business');
const Expense = require('../models/Expense');
const {
  uploadReceiptToCloudinary,
  deleteReceiptFromCloudinary,
  createTemporaryReceiptUrl,
} = require('../services/cloudinaryReceiptService');

const categories = ['Rent', 'Salary', 'Utilities', 'Transport', 'Marketing', 'Supplies', 'Maintenance', 'Tax', 'Other'];
const paymentMethods = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Other'];
const frequencies = ['None', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];
const clean = (value) => `${value ?? ''}`.trim();
const asBoolean = (value) => value === true || value === 'true';
const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const safeDate = (value, fallback = null) => {
  if (!value) return fallback;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? fallback : result;
};
const getBusiness = (ownerId) => Business.findOne({ ownerId }).select('_id ownerId');

const nextRecurringDate = (date, frequency) => {
  if (frequency === 'None') return null;
  const next = new Date(date);
  if (frequency === 'Weekly') next.setDate(next.getDate() + 7);
  if (frequency === 'Monthly') next.setMonth(next.getMonth() + 1);
  if (frequency === 'Quarterly') next.setMonth(next.getMonth() + 3);
  if (frequency === 'Yearly') next.setFullYear(next.getFullYear() + 1);
  return next;
};

const receiptAsset = (expense) => ({
  publicId: expense?.receiptPublicId,
  resourceType: expense?.receiptResourceType,
  deliveryType: expense?.receiptDeliveryType,
});

const receiptFields = (file, uploaded) => ({
  receiptOriginalName: file.originalname,
  receiptPublicId: uploaded.public_id,
  receiptFormat: uploaded.format,
  receiptResourceType: uploaded.resource_type || 'image',
  receiptDeliveryType: uploaded.type || 'authenticated',
  receiptMimeType: file.mimetype,
  receiptSize: uploaded.bytes || file.size,
});

const clearReceipt = (expense) => {
  expense.receiptOriginalName = '';
  expense.receiptPublicId = '';
  expense.receiptFormat = '';
  expense.receiptResourceType = 'image';
  expense.receiptDeliveryType = 'authenticated';
  expense.receiptMimeType = '';
  expense.receiptSize = 0;
};

const removeReceiptAsset = async (asset) => {
  if (!asset?.publicId) return;
  try {
    await deleteReceiptFromCloudinary(asset);
  } catch (error) {
    console.error('Receipt cleanup error:', error);
  }
};

const serialize = (expense) => {
  const object = expense.toObject ? expense.toObject() : expense;
  const { receiptPublicId, receiptFormat, receiptResourceType, receiptDeliveryType, ...safe } = object;
  return {
    ...safe,
    paymentStatus: safe.paymentStatus || 'Paid', // compatible with older records
    hasReceipt: Boolean(receiptPublicId),
  };
};

const parsePayload = (req, existing = null) => {
  const amount = Number(req.body.amount);
  const expenseDate = safeDate(req.body.expenseDate, existing?.expenseDate || new Date());
  const paymentStatus = req.body.paymentStatus === 'Unpaid' ? 'Unpaid' : 'Paid';
  const requestedMethod = paymentMethods.includes(req.body.paymentMethod) ? req.body.paymentMethod : 'Cash';
  const isRecurring = asBoolean(req.body.isRecurring);
  const recurrenceFrequency = isRecurring && frequencies.includes(req.body.recurrenceFrequency)
    ? req.body.recurrenceFrequency
    : 'None';
  const recurrenceEndDate = isRecurring ? safeDate(req.body.recurrenceEndDate) : null;
  const nextDueDate = isRecurring ? nextRecurringDate(expenseDate, recurrenceFrequency) : null;

  return {
    title: clean(req.body.title),
    category: categories.includes(req.body.category) ? req.body.category : 'Other',
    amount,
    expenseDate,
    paymentStatus,
    paymentMethod: paymentStatus === 'Paid' ? requestedMethod : 'Not selected',
    dueDate: paymentStatus === 'Unpaid' ? safeDate(req.body.dueDate) : null,
    paidAt: paymentStatus === 'Paid'
      ? safeDate(req.body.paidAt, existing?.paidAt || expenseDate || new Date())
      : null,
    transactionReference: paymentStatus === 'Paid' ? clean(req.body.transactionReference) : '',
    vendor: clean(req.body.vendor),
    vendorUpiId: clean(req.body.vendorUpiId),
    referenceNumber: clean(req.body.referenceNumber),
    description: clean(req.body.description),
    isRecurring: isRecurring && recurrenceFrequency !== 'None',
    recurrenceFrequency,
    nextDueDate: recurrenceEndDate && nextDueDate && nextDueDate > recurrenceEndDate ? null : nextDueDate,
    recurrenceEndDate,
  };
};

const validate = (payload) => {
  if (!payload.title) return 'Expense title is required';
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) return 'Amount must be greater than zero';
  if (!payload.expenseDate) return 'Enter a valid expense date';
  if (payload.paymentStatus === 'Unpaid' && !payload.dueDate) return 'Due date is required for an unpaid expense';
  if (payload.recurrenceEndDate && payload.recurrenceEndDate <= payload.expenseDate) {
    return 'Recurring end date must be after the expense date';
  }
  return null;
};

const buildFilter = (businessId, query) => {
  const filter = { businessId };
  const and = [];
  if (categories.includes(query.category)) filter.category = query.category;
  if (paymentMethods.includes(query.paymentMethod)) filter.paymentMethod = query.paymentMethod;
  if (query.paymentStatus === 'Unpaid') filter.paymentStatus = 'Unpaid';
  if (query.paymentStatus === 'Paid') {
    and.push({ $or: [{ paymentStatus: 'Paid' }, { paymentStatus: { $exists: false } }] });
  }
  if (query.recurring === 'true') filter.isRecurring = true;
  if (query.recurring === 'false') filter.isRecurring = false;
  const search = clean(query.search);
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    and.push({ $or: [{ title: regex }, { vendor: regex }, { referenceNumber: regex }, { transactionReference: regex }] });
  }
  if (query.from || query.to) {
    filter.expenseDate = {};
    const from = safeDate(query.from);
    const to = safeDate(query.to);
    if (from) filter.expenseDate.$gte = from;
    if (to) {
      to.setHours(23, 59, 59, 999);
      filter.expenseDate.$lte = to;
    }
  }
  if (and.length) filter.$and = and;
  return filter;
};

const listExpenses = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const expenses = await Expense.find(buildFilter(business._id, req.query))
      .sort({ paymentStatus: -1, dueDate: 1, expenseDate: -1 })
      .limit(500)
      .lean();
    return res.json({ expenses: expenses.map(serialize) });
  } catch (error) {
    console.error('List expenses error:', error);
    return res.status(500).json({ message: 'Unable to load expenses' });
  }
};

const getExpenseSummary = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [totals, categoriesThisMonth] = await Promise.all([
      Expense.aggregate([
        { $match: { businessId: business._id } },
        { $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' },
          expenseCount: { $sum: 1 },
          paidAmount: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$paymentStatus', 'Paid'] }, 'Paid'] }, '$amount', 0] } },
          unpaidAmount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Unpaid'] }, '$amount', 0] } },
          unpaidCount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Unpaid'] }, 1, 0] } },
          overdueCount: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentStatus', 'Unpaid'] }, { $lt: ['$dueDate', today] }] }, 1, 0] } },
          monthExpenses: { $sum: { $cond: [{ $and: [{ $gte: ['$expenseDate', monthStart] }, { $lt: ['$expenseDate', monthEnd] }] }, '$amount', 0] } },
          recurringCount: { $sum: { $cond: ['$isRecurring', 1, 0] } },
        } },
      ]),
      Expense.aggregate([
        { $match: { businessId: business._id, expenseDate: { $gte: monthStart, $lt: monthEnd } } },
        { $group: { _id: '$category', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { amount: -1 } },
      ]),
    ]);
    const base = totals[0] || {};
    return res.json({
      summary: {
        totalExpenses: money(base.totalExpenses),
        monthExpenses: money(base.monthExpenses),
        paidAmount: money(base.paidAmount),
        unpaidAmount: money(base.unpaidAmount),
        expenseCount: base.expenseCount || 0,
        unpaidCount: base.unpaidCount || 0,
        overdueCount: base.overdueCount || 0,
        recurringCount: base.recurringCount || 0,
      },
      byCategory: categoriesThisMonth.map((row) => ({ category: row._id, amount: money(row.amount), count: row.count })),
    });
  } catch (error) {
    console.error('Expense summary error:', error);
    return res.status(500).json({ message: 'Unable to load expense summary' });
  }
};

const saveExpense = (editing) => async (req, res) => {
  let uploaded = null;
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    let expense = null;
    if (editing) {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid expense ID' });
      expense = await Expense.findOne({ _id: req.params.id, businessId: business._id, ownerId: req.userId });
      if (!expense) return res.status(404).json({ message: 'Expense not found' });
    }
    const payload = parsePayload(req, expense);
    const problem = validate(payload);
    if (problem) return res.status(400).json({ message: problem });

    const oldReceipt = receiptAsset(expense);
    if (req.file) {
      uploaded = await uploadReceiptToCloudinary({
        buffer: req.file.buffer,
        businessId: business._id.toString(),
        originalName: req.file.originalname,
      });
    }
    if (!expense) {
      expense = new Expense({ ...payload, businessId: business._id, ownerId: req.userId });
    } else {
      Object.assign(expense, payload);
    }
    if (req.file && uploaded) Object.assign(expense, receiptFields(req.file, uploaded));
    await expense.save();
    if (editing && uploaded && oldReceipt.publicId) await removeReceiptAsset(oldReceipt);
    return res.status(editing ? 200 : 201).json({
      message: editing ? 'Expense updated successfully' : 'Expense added successfully',
      expense: serialize(expense),
    });
  } catch (error) {
    if (uploaded?.public_id) await removeReceiptAsset({ publicId: uploaded.public_id, resourceType: uploaded.resource_type, deliveryType: uploaded.type });
    console.error('Save expense error:', error);
    if (error?.code === 'CLOUDINARY_NOT_CONFIGURED' || Number.isFinite(error?.http_code)) {
      return res.status(503).json({ message: 'Image storage is unavailable. Check the Cloudinary variables on Render.' });
    }
    return res.status(500).json({ message: 'Unable to save expense' });
  }
};

const markExpensePaid = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid expense ID' });
    const business = await getBusiness(req.userId);
    const expense = business && await Expense.findOne({ _id: req.params.id, businessId: business._id, ownerId: req.userId });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    const method = paymentMethods.includes(req.body.paymentMethod) ? req.body.paymentMethod : null;
    if (!method) return res.status(400).json({ message: 'Select how the expense was paid' });
    expense.paymentStatus = 'Paid';
    expense.paymentMethod = method;
    expense.paidAt = safeDate(req.body.paidAt, new Date());
    expense.transactionReference = clean(req.body.transactionReference);
    await expense.save();
    return res.json({ message: 'Expense marked as paid', expense: serialize(expense) });
  } catch (error) {
    console.error('Mark expense paid error:', error);
    return res.status(500).json({ message: 'Unable to update the expense payment' });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    const expense = business && mongoose.isValidObjectId(req.params.id)
      ? await Expense.findOneAndDelete({ _id: req.params.id, businessId: business._id, ownerId: req.userId })
      : null;
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    await removeReceiptAsset(receiptAsset(expense));
    return res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete expense' });
  }
};

const getReceipt = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    const expense = business && mongoose.isValidObjectId(req.params.id)
      ? await Expense.findOne({ _id: req.params.id, businessId: business._id, ownerId: req.userId }).lean()
      : null;
    if (!expense?.receiptPublicId) return res.status(404).json({ message: 'Receipt not found' });
    const url = createTemporaryReceiptUrl({
      publicId: expense.receiptPublicId,
      format: expense.receiptFormat,
      resourceType: expense.receiptResourceType,
      deliveryType: expense.receiptDeliveryType,
    });
    res.set('Cache-Control', 'private, no-store');
    return res.redirect(302, url);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load receipt' });
  }
};

const deleteReceipt = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    const expense = business && mongoose.isValidObjectId(req.params.id)
      ? await Expense.findOne({ _id: req.params.id, businessId: business._id, ownerId: req.userId })
      : null;
    if (!expense?.receiptPublicId) return res.status(404).json({ message: 'Receipt not found' });
    const oldReceipt = receiptAsset(expense);
    clearReceipt(expense);
    await expense.save();
    await removeReceiptAsset(oldReceipt);
    return res.json({ message: 'Receipt removed successfully', expense: serialize(expense) });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to remove receipt' });
  }
};

module.exports = {
  listExpenses,
  getExpenseSummary,
  createExpense: saveExpense(false),
  updateExpense: saveExpense(true),
  markExpensePaid,
  deleteExpense,
  getReceipt,
  deleteReceipt,
};
