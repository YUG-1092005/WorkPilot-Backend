const mongoose = require('mongoose');
const Business = require('../models/Business');
const Expense = require('../models/Expense');
const {
  uploadReceiptToCloudinary,
  deleteReceiptFromCloudinary,
  createTemporaryReceiptUrl,
} = require('../services/cloudinaryReceiptService');
const { recordActivity } = require('../services/activityService');

const categories = ['Rent', 'Salary', 'Utilities', 'Transport', 'Marketing', 'Supplies', 'Maintenance', 'Tax', 'Other'];
const paymentMethods = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Other'];
const frequencies = ['None', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const cleanText = (value) => `${value ?? ''}`.trim();
const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};
const asBoolean = (value) => value === true || value === 'true';
const getBusiness = (ownerId) => Business.findOne({ ownerId }).select('_id ownerId');

const safeDate = (value, fallback = null) => {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const calculateNextDueDate = (expenseDate, frequency) => {
  if (frequency === 'None') return null;
  const next = new Date(expenseDate);
  if (frequency === 'Weekly') next.setDate(next.getDate() + 7);
  if (frequency === 'Monthly') next.setMonth(next.getMonth() + 1);
  if (frequency === 'Quarterly') next.setMonth(next.getMonth() + 3);
  if (frequency === 'Yearly') next.setFullYear(next.getFullYear() + 1);
  return next;
};

const cloudReceipt = (expense) => ({
  publicId: expense?.receiptPublicId,
  resourceType: expense?.receiptResourceType,
  deliveryType: expense?.receiptDeliveryType,
});

const removeCloudReceipt = async (receipt, { throwOnFailure = false } = {}) => {
  if (!receipt?.publicId) return;
  try {
    await deleteReceiptFromCloudinary(receipt);
  } catch (error) {
    console.error('Cloudinary receipt cleanup error:', error);
    if (throwOnFailure) throw error;
  }
};

const receiptFields = (file, uploaded) => ({
  receiptOriginalName: file.originalname,
  receiptPublicId: uploaded.public_id,
  receiptFormat: uploaded.format,
  receiptResourceType: uploaded.resource_type || 'image',
  receiptDeliveryType: uploaded.type || 'authenticated',
  receiptMimeType: file.mimetype,
  receiptSize: uploaded.bytes || file.size,
});

const clearReceiptFields = (expense) => {
  expense.receiptOriginalName = '';
  expense.receiptPublicId = '';
  expense.receiptFormat = '';
  expense.receiptResourceType = 'image';
  expense.receiptDeliveryType = 'authenticated';
  expense.receiptMimeType = '';
  expense.receiptSize = 0;
};

const isCloudinaryError = (error) =>
  error?.code === 'CLOUDINARY_NOT_CONFIGURED' || Number.isFinite(error?.http_code);

const serialize = (expense) => {
  const object = expense.toObject ? expense.toObject() : expense;
  const {
    receiptPublicId,
    receiptFormat,
    receiptResourceType,
    receiptDeliveryType,
    ...safeExpense
  } = object;
  return { ...safeExpense, hasReceipt: Boolean(receiptPublicId) };
};

const buildFilter = (businessId, query) => {
  const filter = { businessId };
  const search = cleanText(query.search);
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [
      { title: expression },
      { vendor: expression },
      { referenceNumber: expression },
      { description: expression },
    ];
  }
  if (categories.includes(query.category)) filter.category = query.category;
  if (paymentMethods.includes(query.paymentMethod)) filter.paymentMethod = query.paymentMethod;
  if (query.recurring === 'true') filter.isRecurring = true;
  if (query.recurring === 'false') filter.isRecurring = false;
  if (query.from || query.to) {
    filter.expenseDate = {};
    const from = safeDate(query.from);
    const to = safeDate(query.to);
    if (from) filter.expenseDate.$gte = from;
    if (to) {
      to.setHours(23, 59, 59, 999);
      filter.expenseDate.$lte = to;
    }
    if (Object.keys(filter.expenseDate).length === 0) delete filter.expenseDate;
  }
  return filter;
};

const expensePayload = (req, existing = null) => {
  const title = cleanText(req.body.title);
  const amount = asNumber(req.body.amount);
  const expenseDate = safeDate(req.body.expenseDate, existing?.expenseDate || new Date());
  const category = categories.includes(req.body.category) ? req.body.category : 'Other';
  const paymentMethod = paymentMethods.includes(req.body.paymentMethod) ? req.body.paymentMethod : 'Cash';
  const isRecurring = asBoolean(req.body.isRecurring);
  const recurrenceFrequency = isRecurring && frequencies.includes(req.body.recurrenceFrequency)
    ? req.body.recurrenceFrequency
    : 'None';
  const recurrenceEndDate = isRecurring ? safeDate(req.body.recurrenceEndDate) : null;
  const nextDueDate = isRecurring ? calculateNextDueDate(expenseDate, recurrenceFrequency) : null;
  return {
    title,
    amount,
    expenseDate,
    category,
    paymentMethod,
    vendor: cleanText(req.body.vendor),
    referenceNumber: cleanText(req.body.referenceNumber),
    description: cleanText(req.body.description),
    isRecurring: isRecurring && recurrenceFrequency !== 'None',
    recurrenceFrequency,
    nextDueDate: recurrenceEndDate && nextDueDate && nextDueDate > recurrenceEndDate ? null : nextDueDate,
    recurrenceEndDate,
  };
};

const validatePayload = (payload) => {
  if (!payload.title) return 'Expense title is required';
  if (payload.title.length > 120) return 'Expense title is too long';
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) return 'Amount must be greater than zero';
  if (!payload.expenseDate) return 'Enter a valid expense date';
  if (payload.recurrenceEndDate && payload.recurrenceEndDate <= payload.expenseDate) {
    return 'Recurring end date must be after the expense date';
  }
  return null;
};

const listExpenses = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const expenses = await Expense.find(buildFilter(business._id, req.query))
      .sort({ expenseDate: -1, createdAt: -1 })
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
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [totals, byCategory, upcoming] = await Promise.all([
      Expense.aggregate([
        { $match: { businessId: business._id } },
        {
          $group: {
            _id: null,
            totalExpenses: { $sum: '$amount' },
            expenseCount: { $sum: 1 },
            recurringCount: { $sum: { $cond: ['$isRecurring', 1, 0] } },
            todayExpenses: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ['$expenseDate', today] }, { $lt: ['$expenseDate', tomorrow] }] },
                  '$amount',
                  0,
                ],
              },
            },
            monthExpenses: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ['$expenseDate', monthStart] }, { $lt: ['$expenseDate', monthEnd] }] },
                  '$amount',
                  0,
                ],
              },
            },
          },
        },
      ]),
      Expense.aggregate([
        { $match: { businessId: business._id, expenseDate: { $gte: monthStart, $lt: monthEnd } } },
        { $group: { _id: '$category', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { amount: -1 } },
      ]),
      Expense.aggregate([
        {
          $match: {
            businessId: business._id,
            isRecurring: true,
            nextDueDate: { $ne: null },
            $or: [{ recurrenceEndDate: null }, { recurrenceEndDate: { $gte: today } }],
          },
        },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ]);

    const top = byCategory[0];
    return res.json({
      summary: {
        ...(totals[0] || { totalExpenses: 0, expenseCount: 0, recurringCount: 0, todayExpenses: 0, monthExpenses: 0 }),
        upcomingRecurringCount: upcoming[0]?.count || 0,
        upcomingRecurringAmount: roundMoney(upcoming[0]?.amount || 0),
        topCategory: top?._id || '',
        topCategoryAmount: roundMoney(top?.amount || 0),
      },
      byCategory: byCategory.map((entry) => ({
        category: entry._id,
        amount: roundMoney(entry.amount),
        count: entry.count,
      })),
    });
  } catch (error) {
    console.error('Expense summary error:', error);
    return res.status(500).json({ message: 'Unable to load expense summary' });
  }
};

const createExpense = async (req, res) => {
  let uploadedReceipt = null;
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const payload = expensePayload(req);
    const validation = validatePayload(payload);
    if (validation) return res.status(400).json({ message: validation });

    if (req.file) {
      uploadedReceipt = await uploadReceiptToCloudinary({
        buffer: req.file.buffer,
        businessId: business._id.toString(),
        originalName: req.file.originalname,
      });
    }

    const expense = await Expense.create({
      ...payload,
      businessId: business._id,
      ownerId: req.userId,
      ...(req.file && uploadedReceipt ? receiptFields(req.file, uploadedReceipt) : {}),
    });
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'expense_added', category: 'Expenses', title: `${expense.title} expense added`, description: `${expense.category} • ${expense.paymentMethod}`, amount: expense.amount, entityType: 'Expense', entityId: expense._id, route: '/expenses' });
    return res.status(201).json({ message: 'Expense added successfully', expense: serialize(expense) });
  } catch (error) {
    if (uploadedReceipt?.public_id) {
      await removeCloudReceipt({
        publicId: uploadedReceipt.public_id,
        resourceType: uploadedReceipt.resource_type,
        deliveryType: uploadedReceipt.type,
      });
    }
    console.error('Create expense error:', error);
    if (isCloudinaryError(error)) {
      return res.status(503).json({ message: 'Receipt cloud storage is unavailable or not configured' });
    }
    return res.status(500).json({ message: 'Unable to add expense' });
  }
};

const updateExpense = async (req, res) => {
  let uploadedReceipt = null;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid expense ID' });
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const expense = await Expense.findOne({ _id: req.params.id, businessId: business._id, ownerId: req.userId });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    const payload = expensePayload(req, expense);
    const validation = validatePayload(payload);
    if (validation) return res.status(400).json({ message: validation });

    const oldReceipt = cloudReceipt(expense);
    if (req.file) {
      uploadedReceipt = await uploadReceiptToCloudinary({
        buffer: req.file.buffer,
        businessId: business._id.toString(),
        originalName: req.file.originalname,
      });
    }

    Object.assign(expense, payload);
    if (req.file && uploadedReceipt) Object.assign(expense, receiptFields(req.file, uploadedReceipt));
    await expense.save();
    if (req.file && oldReceipt.publicId) await removeCloudReceipt(oldReceipt);
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'expense_updated', category: 'Expenses', title: `${expense.title} expense updated`, description: expense.category, amount: expense.amount, entityType: 'Expense', entityId: expense._id, route: '/expenses' });
    return res.json({ message: 'Expense updated successfully', expense: serialize(expense) });
  } catch (error) {
    if (uploadedReceipt?.public_id) {
      await removeCloudReceipt({
        publicId: uploadedReceipt.public_id,
        resourceType: uploadedReceipt.resource_type,
        deliveryType: uploadedReceipt.type,
      });
    }
    console.error('Update expense error:', error);
    if (isCloudinaryError(error)) {
      return res.status(503).json({ message: 'Receipt cloud storage is unavailable or not configured' });
    }
    return res.status(500).json({ message: 'Unable to update expense' });
  }
};

const deleteExpense = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid expense ID' });
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, businessId: business._id, ownerId: req.userId });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    await removeCloudReceipt(cloudReceipt(expense));
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'expense_deleted', category: 'Expenses', title: `${expense.title} expense deleted`, description: expense.category, amount: expense.amount, entityType: 'Expense', entityId: expense._id, route: '/expenses' });
    return res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    return res.status(500).json({ message: 'Unable to delete expense' });
  }
};

const getReceipt = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid expense ID' });
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const expense = await Expense.findOne({ _id: req.params.id, businessId: business._id, ownerId: req.userId }).lean();
    if (!expense?.receiptPublicId) return res.status(404).json({ message: 'Receipt not found' });

    const temporaryUrl = createTemporaryReceiptUrl({
      publicId: expense.receiptPublicId,
      format: expense.receiptFormat,
      resourceType: expense.receiptResourceType,
      deliveryType: expense.receiptDeliveryType,
    });
    res.set('Cache-Control', 'private, no-store');
    return res.redirect(302, temporaryUrl);
  } catch (error) {
    console.error('Get receipt error:', error);
    if (isCloudinaryError(error)) {
      return res.status(503).json({ message: 'Receipt cloud storage is unavailable or not configured' });
    }
    return res.status(500).json({ message: 'Unable to load receipt' });
  }
};

const deleteReceipt = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid expense ID' });
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const expense = await Expense.findOne({ _id: req.params.id, businessId: business._id, ownerId: req.userId });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    if (!expense.receiptPublicId) return res.status(404).json({ message: 'Receipt not found' });
    const oldReceipt = cloudReceipt(expense);
    clearReceiptFields(expense);
    await expense.save();
    await removeCloudReceipt(oldReceipt);
    return res.json({ message: 'Receipt removed successfully', expense: serialize(expense) });
  } catch (error) {
    console.error('Delete receipt error:', error);
    return res.status(500).json({ message: 'Unable to remove receipt' });
  }
};

module.exports = { listExpenses, getExpenseSummary, createExpense, updateExpense, deleteExpense, getReceipt, deleteReceipt };
