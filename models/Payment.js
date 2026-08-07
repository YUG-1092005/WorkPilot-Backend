const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  invoiceNumber: { type: String, required: true, trim: true, index: true },
  customerName: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  amountPaise: { type: Number, required: true, min: 1 },
  appliedAmount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'INR' },
  provider: { type: String, default: 'Razorpay' },
  razorpayOrderId: { type: String, required: true, unique: true, index: true },
  razorpayPaymentId: { type: String, default: '', index: true },
  status: {
    type: String,
    enum: ['Created', 'Authorized', 'Captured', 'Failed', 'Refunded'],
    default: 'Created',
    index: true,
  },
  method: { type: String, default: '' },
  email: { type: String, default: '' },
  contact: { type: String, default: '' },
  errorCode: { type: String, default: '' },
  errorDescription: { type: String, default: '' },
  appliedToInvoice: { type: Boolean, default: false, index: true },
  applyingToInvoice: { type: Boolean, default: false },
  paidAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  webhookEventIds: { type: [String], default: [] },
}, { timestamps: true });

paymentSchema.index({ businessId: 1, createdAt: -1 });
paymentSchema.index({ businessId: 1, invoiceId: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
