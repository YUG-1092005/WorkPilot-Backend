const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    unit: { type: String, default: 'pcs', trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
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
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    invoiceNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, required: true, default: Date.now, index: true },
    dueDate: { type: Date, default: null },
    customerSnapshot: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, default: '' },
      address: { type: String, default: '' },
      city: { type: String, default: '' },
    },
    businessSnapshot: {
      name: { type: String, required: true },
      phone: { type: String, default: '' },
      businessType: { type: String, default: '' },
      email: { type: String, default: '' },
      addressLine1: { type: String, default: '' },
      addressLine2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      gstin: { type: String, default: '' },
      pan: { type: String, default: '' },
      bank: {
        accountName: { type: String, default: '' },
        bankName: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        ifsc: { type: String, default: '' },
        upiId: { type: String, default: '' },
      },
      invoiceSettings: {
        taxLabel: { type: String, default: 'GST' },
        terms: { type: String, default: '' },
        footerNote: { type: String, default: 'Thank you for your business.' },
        accentColor: { type: String, default: '#2563EB' },
        showLogo: { type: Boolean, default: true },
        showSignature: { type: Boolean, default: true },
        signatureLabel: { type: String, default: 'Authorized Signatory' },
      },
    },
    items: {
      type: [invoiceItemSchema],
      validate: [(items) => items.length > 0, 'Invoice requires at least one item'],
    },
    subtotal: { type: Number, required: true, min: 0 },
    discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    discountValue: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
    grossProfit: { type: Number, required: true },
    paidAmount: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Partial', 'Pending'],
      default: 'Pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Razorpay', 'Other'],
      default: 'Cash',
    },
    onlinePaymentIds: { type: [String], default: [] },
    lastPaymentAt: { type: Date, default: null },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
    status: { type: String, enum: ['Active', 'Cancelled'], default: 'Active', index: true },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

invoiceSchema.index({ businessId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ businessId: 1, invoiceDate: -1 });
invoiceSchema.index({ businessId: 1, customerId: 1, invoiceDate: -1 });
invoiceSchema.index({ businessId: 1, onlinePaymentIds: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
