const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      maxlength: 150,
    },
    address: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300,
    },
    city: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
    },
    customerType: {
      type: String,
      enum: ['Regular', 'VIP', 'Wholesale'],
      default: 'Regular',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    creditLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    outstandingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPurchases: {
      type: Number,
      default: 0,
      min: 0,
    },
    purchaseCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastPurchaseAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

customerSchema.index(
  { businessId: 1, phone: 1 },
  { unique: true, name: 'unique_customer_phone_per_business' },
);
customerSchema.index({ businessId: 1, name: 1 });

module.exports = mongoose.model('Customer', customerSchema);
