const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
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
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
    },
    category: {
      type: String,
      default: 'General',
      trim: true,
      maxlength: 60,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    costPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    sellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      required: true,
      min: 0,
      default: 5,
    },
    unit: {
      type: String,
      default: 'pcs',
      trim: true,
      maxlength: 20,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    stockAlertState: {
      type: String,
      enum: ['healthy', 'low', 'out'],
      default: 'healthy',
      index: true,
    },
  },
  { timestamps: true },
);

productSchema.index({ businessId: 1, sku: 1 }, { unique: true });
productSchema.index({ businessId: 1, name: 1 });

module.exports = mongoose.model('Product', productSchema);
