const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, default: '', trim: true, maxlength: 800 },
    category: {
      type: String,
      enum: ['Payment', 'Customer', 'Inventory', 'Delivery', 'General'],
      default: 'General',
      index: true,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
      index: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed'],
      default: 'Pending',
      index: true,
    },
    dueAt: { type: Date, required: true, index: true },
    reminderMinutes: { type: Number, enum: [0, 15, 30, 60, 180, 1440], default: 30 },
    reminderAt: { type: Date, required: true, index: true },
    reminderNotificationSentAt: { type: Date, default: null },
    overdueNotificationSentAt: { type: Date, default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    isRecurring: { type: Boolean, default: false, index: true },
    recurrenceFrequency: {
      type: String,
      enum: ['None', 'Daily', 'Weekly', 'Monthly'],
      default: 'None',
    },
    recurrenceEndDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    recurrenceSpawnedTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    sourceRecurringTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { timestamps: true },
);

taskSchema.index({ businessId: 1, status: 1, dueAt: 1 });
taskSchema.index({ businessId: 1, category: 1, priority: 1 });
taskSchema.index({ businessId: 1, reminderAt: 1, reminderNotificationSentAt: 1 });
taskSchema.index(
  { sourceRecurringTaskId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceRecurringTaskId: { $type: 'objectId' } },
    name: 'one_next_task_per_recurrence',
  },
);

module.exports = mongoose.model('Task', taskSchema);
