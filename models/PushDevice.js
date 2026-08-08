const mongoose = require('mongoose');

const pushDeviceSchema = new mongoose.Schema(
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
    deviceId: { type: String, required: true, trim: true, maxlength: 180 },
    token: { type: String, required: true, trim: true, unique: true },
    platform: {
      type: String,
      enum: ['android', 'ios', 'unknown'],
      default: 'android',
    },
    isActive: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

pushDeviceSchema.index({ ownerId: 1, deviceId: 1 });

module.exports = mongoose.model('PushDevice', pushDeviceSchema);
