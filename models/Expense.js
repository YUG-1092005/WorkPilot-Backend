const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  category: {
    type: String,
    enum: ['Rent', 'Salary', 'Utilities', 'Transport', 'Marketing', 'Supplies', 'Maintenance', 'Tax', 'Other'],
    default: 'Other',
    index: true,
  },
  amount: { type: Number, required: true, min: 0.01 },
  expenseDate: { type: Date, required: true, default: Date.now, index: true },

  // An expense can first be saved as due, then paid from the Payments screen.
  paymentStatus: { type: String, enum: ['Unpaid', 'Paid'], default: 'Paid', index: true },
  paymentMethod: {
    type: String,
    enum: ['Not selected', 'Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Other'],
    default: 'Cash',
  },
  dueDate: { type: Date, default: null, index: true },
  paidAt: { type: Date, default: null, index: true },
  transactionReference: { type: String, default: '', trim: true, maxlength: 120 },
  vendor: { type: String, default: '', trim: true, maxlength: 120 },
  vendorUpiId: { type: String, default: '', trim: true, maxlength: 120 },
  referenceNumber: { type: String, default: '', trim: true, maxlength: 80 },
  description: { type: String, default: '', trim: true, maxlength: 500 },

  isRecurring: { type: Boolean, default: false, index: true },
  recurrenceFrequency: {
    type: String,
    enum: ['None', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'],
    default: 'None',
  },
  nextDueDate: { type: Date, default: null, index: true },
  recurrenceEndDate: { type: Date, default: null },

  receiptOriginalName: { type: String, default: '' },
  receiptPublicId: { type: String, default: '', trim: true },
  receiptFormat: { type: String, default: '', trim: true },
  receiptResourceType: { type: String, default: 'image', trim: true },
  receiptDeliveryType: { type: String, default: 'authenticated', trim: true },
  receiptMimeType: { type: String, default: '' },
  receiptSize: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

expenseSchema.index({ businessId: 1, expenseDate: -1 });
expenseSchema.index({ businessId: 1, paymentStatus: 1, dueDate: 1 });
expenseSchema.index({ businessId: 1, isRecurring: 1, nextDueDate: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
