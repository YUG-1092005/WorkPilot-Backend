const AppNotification = require('../models/AppNotification');
const Task = require('../models/Task');

const reminderMessage = (task) => {
  const minutes = Number(task.reminderMinutes || 0);
  if (minutes === 0) return `${task.title} is due now.`;
  if (minutes === 1440) return `${task.title} is due in 1 day.`;
  if (minutes >= 60) return `${task.title} is due in ${minutes / 60} hour${minutes === 60 ? '' : 's'}.`;
  return `${task.title} is due in ${minutes} minutes.`;
};

const notificationPayload = (task, type) => ({
  businessId: task.businessId,
  ownerId: task.ownerId,
  taskId: task._id,
  type,
  severity: type === 'task_overdue' || task.priority === 'Urgent' ? 'critical' : 'warning',
  title: type === 'task_overdue' ? 'Task overdue' : 'Task reminder',
  message: type === 'task_overdue'
    ? `${task.title} is overdue. Open Tasks to update or complete it.`
    : reminderMessage(task),
  metadata: {
    taskTitle: task.title,
    dueAt: task.dueAt,
    priority: task.priority,
  },
});

const claimAndNotify = async ({ task, type, sentField }) => {
  const claimed = await Task.findOneAndUpdate(
    { _id: task._id, status: 'Pending', [sentField]: null },
    { $set: { [sentField]: new Date() } },
    { new: true },
  );
  if (!claimed) return null;
  try {
    return await AppNotification.create(notificationPayload(claimed, type));
  } catch (error) {
    if (error?.code !== 11000) {
      await Task.updateOne({ _id: claimed._id }, { $set: { [sentField]: null } });
      throw error;
    }
    return null;
  }
};

const syncTaskNotifications = async ({ businessId, ownerId }) => {
  const now = new Date();
  const base = { businessId, ownerId, status: 'Pending' };
  const [dueReminders, overdue] = await Promise.all([
    Task.find({
      ...base,
      reminderAt: { $lte: now },
      dueAt: { $gt: now },
      reminderNotificationSentAt: null,
    }).sort({ reminderAt: 1 }).limit(50),
    Task.find({
      ...base,
      dueAt: { $lte: now },
      overdueNotificationSentAt: null,
    }).sort({ dueAt: 1 }).limit(50),
  ]);

  for (const task of dueReminders) {
    await claimAndNotify({ task, type: 'task_reminder', sentField: 'reminderNotificationSentAt' });
  }
  for (const task of overdue) {
    await claimAndNotify({ task, type: 'task_overdue', sentField: 'overdueNotificationSentAt' });
  }
};

module.exports = { syncTaskNotifications };
