const mongoose = require('mongoose');

const businessCardSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    unique: true,
    index: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  template: {
    type: String,
    enum: ['modern', 'classic', 'minimal', 'dark'],
    default: 'modern',
  },
  primaryColor: {
    type: String,
    default: '#2563EB',
    match: /^#[0-9A-F]{6}$/i,
  },
  tagline: {
    type: String,
    default: '',
    trim: true,
    maxlength: 160,
  },
  website: {
    type: String,
    default: '',
    trim: true,
    maxlength: 250,
  },
  whatsapp: {
    type: String,
    default: '',
    trim: true,
    maxlength: 30,
  },
  instagram: {
    type: String,
    default: '',
    trim: true,
    maxlength: 120,
  },
  linkedin: {
    type: String,
    default: '',
    trim: true,
    maxlength: 250,
  },
  services: {
    type: [String],
    default: [],
  },
  publicEnabled: {
    type: Boolean,
    default: true,
  },
  viewCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  leadCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastViewedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('BusinessCard', businessCardSchema);
