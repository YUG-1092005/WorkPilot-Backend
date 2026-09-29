const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },

    type: {
      type: String,
      enum: [
        'General',
        'Customer',
        'Invoice',
        'Product',
        'Expense',
      ],
      default: 'General',
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },

    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },

    expenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense',
      default: null,
    },

    isPinned: {
      type: Boolean,
      default: false,
    },

    followUpDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

noteSchema.index({ businessId: 1, createdAt: -1 });
noteSchema.index({ businessId: 1, isPinned: 1 });

module.exports = mongoose.model('Note', noteSchema);