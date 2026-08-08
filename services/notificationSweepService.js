const AppNotification = require('../models/AppNotification');
const Expense = require('../models/Expense');
const Task = require('../models/Task');
const { syncTaskNotifications } = require('./taskReminderService');

let timer = null;
let running = false;

const createExpenseNotification = async (expense, type) => {
  const overdue = type === 'expense_overdue';
  try {
    await AppNotification.create({
      businessId: expense.businessId,
      ownerId: expense.ownerId,
      expenseId: expense._id,
      type,
      severity: overdue ? 'critical' : 'warning',
      title: overdue ? 'Expense payment overdue' : 'Expense payment due',
      message: overdue
        ? `${expense.title} for ₹${Number(expense.amount).toFixed(2)} is overdue${expense.vendor ? ` for ${expense.vendor}` : ''}.`
        : `${expense.title} for ₹${Number(expense.amount).toFixed(2)} is due soon${expense.vendor ? ` for ${expense.vendor}` : ''}.`,
      metadata: {
        expenseTitle: expense.title,
        vendor: expense.vendor,
        amount: expense.amount,
        dueAt: expense.dueDate,
      },
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
};

const runNotificationSweep = async () => {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const taskScopes = await Task.aggregate([
      {
        $match: {
          status: 'Pending',
          $or: [
            { reminderAt: { $lte: now }, reminderNotificationSentAt: null },
            { dueAt: { $lte: now }, overdueNotificationSentAt: null },
          ],
        },
      },
      { $group: { _id: { businessId: '$businessId', ownerId: '$ownerId' } } },
      { $limit: 500 },
    ]);

    for (const scope of taskScopes) {
      await syncTaskNotifications({
        businessId: scope._id.businessId,
        ownerId: scope._id.ownerId,
      });
    }

    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const expenses = await Expense.find({
      paymentStatus: 'Unpaid',
      dueDate: { $ne: null, $lte: oneDayFromNow },
    })
      .select('_id businessId ownerId title vendor amount dueDate')
      .sort({ dueDate: 1 })
      .limit(500);

    for (const expense of expenses) {
      const type = expense.dueDate < now ? 'expense_overdue' : 'expense_due';
      await createExpenseNotification(expense, type);
    }
  } catch (error) {
    console.error('Notification reminder sweep failed:', error.message);
  } finally {
    running = false;
  }
};

const startNotificationSweeps = () => {
  if (timer) return;
  setTimeout(runNotificationSweep, 15 * 1000).unref();
  timer = setInterval(runNotificationSweep, 60 * 1000);
  timer.unref();
};

module.exports = { runNotificationSweep, startNotificationSweeps };
