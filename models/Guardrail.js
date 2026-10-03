const mongoose = require('mongoose');

const guardrailSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 300,
    },
    type: {
      type: String,
      enum: [
        'invoice_discount_percent',
        'invoice_balance_due',
        'expense_amount',
        'stock_quantity',
        'customer_outstanding',
      ],
      required: true,
    },
    operator: {
      type: String,
      enum: ['gt', 'gte', 'lt', 'lte'],
      required: true,
    },
    threshold: {
      type: Number,
      required: true,
      min: 0,
    },
    action: {
      type: String,
      enum: ['warn', 'create_task', 'block'],
      default: 'warn',
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

guardrailSchema.index({ businessId: 1, active: 1, createdAt: -1 });

module.exports = mongoose.model('Guardrail', guardrailSchema);
