const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
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
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'inventory_low',
        'inventory_out',
        'inventory_restocked',
        'task_reminder',
        'task_overdue',
        'payment_success',
        'payment_failed',
        'payment_refunded',
        'system',
      ],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['info', 'success', 'warning', 'critical'],
      default: 'info',
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    metadata: {
      productName: { type: String, default: '' },
      sku: { type: String, default: '' },
      quantity: { type: Number, default: null },
      threshold: { type: Number, default: null },
      taskTitle: { type: String, default: '' },
      dueAt: { type: Date, default: null },
      priority: { type: String, default: '' },
      invoiceNumber: { type: String, default: '' },
      customerName: { type: String, default: '' },
      paymentId: { type: String, default: '' },
      amount: { type: Number, default: null },
    },
  },
  { timestamps: true },
);

notificationSchema.index({ businessId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ ownerId: 1, createdAt: -1 });
notificationSchema.index(
  { businessId: 1, taskId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { taskId: { $type: 'objectId' } },
    name: 'unique_task_notification_type',
  },
);

module.exports = mongoose.model('AppNotification', notificationSchema);
