const mongoose = require('mongoose');

const cloudAssetSchema = new mongoose.Schema({
  publicId: { type: String, default: '' },
  format: { type: String, default: '' },
  resourceType: { type: String, default: 'image' },
  deliveryType: { type: String, default: 'authenticated' },
  originalName: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  size: { type: Number, default: 0 },
}, { _id: false });

const businessSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  businessName: { type: String, required: true, trim: true, maxlength: 120 },
  businessType: { type: String, default: 'General', trim: true, maxlength: 80 },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  email: { type: String, default: '', trim: true, lowercase: true, maxlength: 160 },
  addressLine1: { type: String, default: '', trim: true, maxlength: 180 },
  addressLine2: { type: String, default: '', trim: true, maxlength: 180 },
  city: { type: String, default: '', trim: true, maxlength: 80 },
  state: { type: String, default: '', trim: true, maxlength: 80 },
  pincode: { type: String, default: '', trim: true, maxlength: 12 },
  gstin: { type: String, default: '', trim: true, uppercase: true, maxlength: 15 },
  pan: { type: String, default: '', trim: true, uppercase: true, maxlength: 10 },
  bank: {
    accountName: { type: String, default: '', trim: true, maxlength: 120 },
    bankName: { type: String, default: '', trim: true, maxlength: 120 },
    accountNumber: { type: String, default: '', trim: true, maxlength: 40 },
    ifsc: { type: String, default: '', trim: true, uppercase: true, maxlength: 11 },
    upiId: { type: String, default: '', trim: true, maxlength: 120 },
  },
  invoiceSettings: {
    prefix: { type: String, default: 'INV', trim: true, uppercase: true, maxlength: 12 },
    taxEnabled: { type: Boolean, default: true },
    taxLabel: { type: String, default: 'GST', trim: true, maxlength: 20 },
    defaultTaxPercent: { type: Number, default: 18, min: 0, max: 100 },
    terms: { type: String, default: 'Payment is due by the date shown on this invoice.', trim: true, maxlength: 1200 },
    footerNote: { type: String, default: 'Thank you for your business.', trim: true, maxlength: 300 },
    accentColor: { type: String, default: '#2563EB', trim: true, maxlength: 7 },
    showLogo: { type: Boolean, default: true },
    showSignature: { type: Boolean, default: true },
    signatureLabel: { type: String, default: 'Authorized Signatory', trim: true, maxlength: 80 },
  },
  logo: { type: cloudAssetSchema, default: () => ({}) },
  signature: { type: cloudAssetSchema, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model('Business', businessSchema);
