const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['invoice_created', 'payment_received', 'invoice_cancelled', 'expense_added', 'expense_updated', 'expense_deleted', 'customer_added', 'customer_updated', 'product_added', 'product_updated', 'stock_adjusted', 'low_stock_warning', 'task_added', 'task_completed', 'task_reopened', 'profile_updated'],
    required: true,
    index: true,
  },
  category: { type: String, enum: ['Sales', 'Expenses', 'Customers', 'Inventory', 'Tasks', 'Business'], required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  amount: { type: Number, default: null },
  entityType: { type: String, default: '', trim: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  route: { type: String, default: '', trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

activitySchema.index({ businessId: 1, occurredAt: -1 });
activitySchema.index({ businessId: 1, category: 1, occurredAt: -1 });
module.exports = mongoose.model('Activity', activitySchema);
