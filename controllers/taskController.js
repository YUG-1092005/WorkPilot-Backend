const mongoose = require('mongoose');
const AppNotification = require('../models/AppNotification');
const Business = require('../models/Business');
const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const Task = require('../models/Task');
const { syncTaskNotifications } = require('../services/taskReminderService');
const { recordActivity } = require('../services/activityService');

const categories = ['Payment', 'Customer', 'Inventory', 'Delivery', 'General'];
const priorities = ['Low', 'Medium', 'High', 'Urgent'];
const frequencies = ['None', 'Daily', 'Weekly', 'Monthly'];
const reminderOptions = [0, 15, 30, 60, 180, 1440];
const cleanText = (value) => `${value ?? ''}`.trim();
const asBoolean = (value) => value === true || value === 'true';
const safeDate = (value, fallback = null) => {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};
const getBusiness = (ownerId) => Business.findOne({ ownerId }).select('_id ownerId');
const indiaOffsetMs = 330 * 60 * 1000;
const startOfIndiaDay = (date = new Date()) => {
  const shifted = new Date(date.getTime() + indiaOffsetMs);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - indiaOffsetMs,
  );
};

const addRecurrence = (date, frequency) => {
  const next = new Date(date);
  if (frequency === 'Daily') next.setDate(next.getDate() + 1);
  if (frequency === 'Weekly') next.setDate(next.getDate() + 7);
  if (frequency === 'Monthly') next.setMonth(next.getMonth() + 1);
  return next;
};

const serialize = (task) => {
  const object = task.toObject ? task.toObject() : task;
  const customer = object.customerId && typeof object.customerId === 'object' ? object.customerId : null;
  const invoice = object.invoiceId && typeof object.invoiceId === 'object' ? object.invoiceId : null;
  const product = object.productId && typeof object.productId === 'object' ? object.productId : null;
  return {
    ...object,
    customerId: customer?._id || object.customerId || null,
    customerName: customer?.name || '',
    invoiceId: invoice?._id || object.invoiceId || null,
    invoiceNumber: invoice?.invoiceNumber || '',
    productId: product?._id || object.productId || null,
    productName: product?.name || '',
  };
};

const populateTask = (query) => query
  .populate('customerId', 'name phone')
  .populate('invoiceId', 'invoiceNumber total balanceDue paymentStatus')
  .populate('productId', 'name sku quantity unit');

const validateReference = async (Model, id, businessId, extra = {}) => {
  if (!id) return null;
  if (!mongoose.isValidObjectId(id)) return false;
  return Model.findOne({ _id: id, businessId, ...extra }).select('_id');
};

const taskPayload = (body, existing = null) => {
  const dueAt = safeDate(body.dueAt, existing?.dueAt || null);
  const parsedReminder = Number(body.reminderMinutes);
  const reminderMinutes = reminderOptions.includes(parsedReminder)
    ? parsedReminder
    : (existing?.reminderMinutes ?? 30);
  const isRecurring = asBoolean(body.isRecurring);
  const recurrenceFrequency = isRecurring && frequencies.includes(body.recurrenceFrequency)
    ? body.recurrenceFrequency
    : 'None';
  return {
    title: cleanText(body.title),
    description: cleanText(body.description),
    category: categories.includes(body.category) ? body.category : 'General',
    priority: priorities.includes(body.priority) ? body.priority : 'Medium',
    dueAt,
    reminderMinutes,
    reminderAt: dueAt ? new Date(dueAt.getTime() - reminderMinutes * 60 * 1000) : null,
    customerId: cleanText(body.customerId) || null,
    invoiceId: cleanText(body.invoiceId) || null,
    productId: cleanText(body.productId) || null,
    isRecurring: isRecurring && recurrenceFrequency !== 'None',
    recurrenceFrequency,
    recurrenceEndDate: isRecurring ? safeDate(body.recurrenceEndDate) : null,
  };
};

const validatePayload = async (payload, businessId) => {
  if (!payload.title) return 'Task title is required';
  if (payload.title.length > 140) return 'Task title is too long';
  if (!payload.dueAt) return 'Enter a valid due date and time';
  if (payload.recurrenceEndDate && payload.recurrenceEndDate < payload.dueAt) {
    return 'Recurring end date cannot be before the first due date';
  }
  const [customer, invoice, product] = await Promise.all([
    validateReference(Customer, payload.customerId, businessId),
    validateReference(Invoice, payload.invoiceId, businessId, { status: 'Active' }),
    validateReference(Product, payload.productId, businessId, { isActive: true }),
  ]);
  if (payload.customerId && !customer) return 'Selected customer is unavailable';
  if (payload.invoiceId && !invoice) return 'Selected invoice is unavailable';
  if (payload.productId && !product) return 'Selected product is unavailable';
  return null;
};

const buildFilter = (businessId, ownerId, query) => {
  const filter = { businessId, ownerId };
  const search = cleanText(query.search);
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ title: expression }, { description: expression }];
  }
  if (categories.includes(query.category)) filter.category = query.category;
  if (priorities.includes(query.priority)) filter.priority = query.priority;

  const today = startOfIndiaDay();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  if (query.view === 'today') {
    filter.status = 'Pending';
    filter.dueAt = { $gte: today, $lt: tomorrow };
  } else if (query.view === 'upcoming') {
    filter.status = 'Pending';
    filter.dueAt = { $gte: tomorrow };
  } else if (query.view === 'overdue') {
    filter.status = 'Pending';
    filter.dueAt = { $lt: new Date() };
  } else if (query.view === 'completed') {
    filter.status = 'Completed';
  } else if (query.view === 'pending') {
    filter.status = 'Pending';
  }
  return filter;
};

const listTasks = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    await syncTaskNotifications({ businessId: business._id, ownerId: req.userId });
    const tasks = await populateTask(
      Task.find(buildFilter(business._id, req.userId, req.query))
        .sort({ status: 1, dueAt: 1, priority: -1 })
        .limit(500),
    );
    return res.json({ tasks: tasks.map(serialize) });
  } catch (error) {
    console.error('List tasks error:', error);
    return res.status(500).json({ message: 'Unable to load tasks' });
  }
};

const getTaskSummary = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    await syncTaskNotifications({ businessId: business._id, ownerId: req.userId });
    const today = startOfIndiaDay();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const base = { businessId: business._id, ownerId: req.userId };
    const [pending, todayCount, overdue, upcoming, completed, urgent, dashboardTasks] = await Promise.all([
      Task.countDocuments({ ...base, status: 'Pending' }),
      Task.countDocuments({ ...base, status: 'Pending', dueAt: { $gte: today, $lt: tomorrow } }),
      Task.countDocuments({ ...base, status: 'Pending', dueAt: { $lt: now } }),
      Task.countDocuments({ ...base, status: 'Pending', dueAt: { $gte: tomorrow } }),
      Task.countDocuments({ ...base, status: 'Completed' }),
      Task.countDocuments({ ...base, status: 'Pending', priority: 'Urgent' }),
      populateTask(Task.find({ ...base, status: 'Pending' }).sort({ dueAt: 1 }).limit(3)),
    ]);
    return res.json({
      summary: { pending, today: todayCount, overdue, upcoming, completed, urgent },
      dashboardTasks: dashboardTasks.map(serialize),
    });
  } catch (error) {
    console.error('Task summary error:', error);
    return res.status(500).json({ message: 'Unable to load task summary' });
  }
};

const getTaskReferences = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const [customers, invoices, products] = await Promise.all([
      Customer.find({ businessId: business._id, isActive: true }).select('_id name phone').sort({ name: 1 }).limit(500).lean(),
      Invoice.find({ businessId: business._id, status: 'Active' }).select('_id invoiceNumber customerId total balanceDue paymentStatus').sort({ invoiceDate: -1 }).limit(500).lean(),
      Product.find({ businessId: business._id, isActive: true }).select('_id name sku quantity unit').sort({ name: 1 }).limit(500).lean(),
    ]);
    return res.json({ customers, invoices, products });
  } catch (error) {
    console.error('Task references error:', error);
    return res.status(500).json({ message: 'Unable to load task links' });
  }
};

const createTask = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const payload = taskPayload(req.body);
    const validation = await validatePayload(payload, business._id);
    if (validation) return res.status(400).json({ message: validation });
    const task = await Task.create({ ...payload, businessId: business._id, ownerId: req.userId });
    const populated = await populateTask(Task.findById(task._id));
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'task_added', category: 'Tasks', title: `Task added: ${task.title}`, description: `${task.priority} priority • ${task.category}`, entityType: 'Task', entityId: task._id, route: '/tasks' });
    return res.status(201).json({ message: 'Task added successfully', task: serialize(populated) });
  } catch (error) {
    console.error('Create task error:', error);
    return res.status(500).json({ message: 'Unable to add task' });
  }
};

const updateTask = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid task ID' });
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const task = await Task.findOne({ _id: req.params.id, businessId: business._id, ownerId: req.userId });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.status === 'Completed') return res.status(409).json({ message: 'Reopen the task before editing it' });
    const payload = taskPayload(req.body, task);
    const validation = await validatePayload(payload, business._id);
    if (validation) return res.status(400).json({ message: validation });
    Object.assign(task, payload, {
      reminderNotificationSentAt: null,
      overdueNotificationSentAt: null,
    });
    await task.save();
    await AppNotification.deleteMany({ businessId: business._id, ownerId: req.userId, taskId: task._id });
    const populated = await populateTask(Task.findById(task._id));
    return res.json({ message: 'Task updated successfully', task: serialize(populated) });
  } catch (error) {
    console.error('Update task error:', error);
    return res.status(500).json({ message: 'Unable to update task' });
  }
};

const updateTaskStatus = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid task ID' });
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const task = await Task.findOne({ _id: req.params.id, businessId: business._id, ownerId: req.userId });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const completed = asBoolean(req.body.completed);
    let nextTask = null;
    task.status = completed ? 'Completed' : 'Pending';
    task.completedAt = completed ? new Date() : null;

    if (!completed) {
      task.reminderNotificationSentAt = null;
      task.overdueNotificationSentAt = null;
      await AppNotification.deleteMany({ businessId: business._id, ownerId: req.userId, taskId: task._id });
    } else {
      await AppNotification.updateMany(
        { businessId: business._id, ownerId: req.userId, taskId: task._id, isRead: false },
        { $set: { isRead: true, readAt: new Date() } },
      );
      if (task.isRecurring && !task.recurrenceSpawnedTaskId) {
        const nextDueAt = addRecurrence(task.dueAt, task.recurrenceFrequency);
        const allowed = !task.recurrenceEndDate || nextDueAt <= task.recurrenceEndDate;
        if (allowed) {
          try {
            nextTask = await Task.create({
              businessId: task.businessId,
              ownerId: task.ownerId,
              title: task.title,
              description: task.description,
              category: task.category,
              priority: task.priority,
              dueAt: nextDueAt,
              reminderMinutes: task.reminderMinutes,
              reminderAt: new Date(nextDueAt.getTime() - task.reminderMinutes * 60 * 1000),
              customerId: task.customerId,
              invoiceId: task.invoiceId,
              productId: task.productId,
              isRecurring: true,
              recurrenceFrequency: task.recurrenceFrequency,
              recurrenceEndDate: task.recurrenceEndDate,
              sourceRecurringTaskId: task._id,
            });
          } catch (error) {
            if (error?.code !== 11000) throw error;
            nextTask = await Task.findOne({ sourceRecurringTaskId: task._id });
          }
          task.recurrenceSpawnedTaskId = nextTask._id;
        }
      }
    }
    await task.save();
    const populated = await populateTask(Task.findById(task._id));
    const populatedNext = nextTask ? await populateTask(Task.findById(nextTask._id)) : null;
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: completed ? 'task_completed' : 'task_reopened', category: 'Tasks', title: `${completed ? 'Task completed' : 'Task reopened'}: ${task.title}`, description: `${task.priority} priority • ${task.category}`, entityType: 'Task', entityId: task._id, route: '/tasks' });
    return res.json({
      message: completed ? 'Task marked as completed' : 'Task reopened',
      task: serialize(populated),
      nextTask: populatedNext ? serialize(populatedNext) : null,
    });
  } catch (error) {
    console.error('Update task status error:', error);
    return res.status(500).json({ message: 'Unable to update task status' });
  }
};

const deleteTask = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid task ID' });
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const task = await Task.findOneAndDelete({ _id: req.params.id, businessId: business._id, ownerId: req.userId });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    await AppNotification.deleteMany({ businessId: business._id, ownerId: req.userId, taskId: task._id });
    return res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    return res.status(500).json({ message: 'Unable to delete task' });
  }
};

module.exports = {
  listTasks,
  getTaskSummary,
  getTaskReferences,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
};
