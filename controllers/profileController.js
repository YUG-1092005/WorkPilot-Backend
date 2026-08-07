const bcrypt = require('bcryptjs');
const Business = require('../models/Business');
const User = require('../models/User');
const { recordActivity } = require('../services/activityService');
const { uploadBusinessMedia, deleteBusinessMedia, temporaryBusinessMediaUrl } = require('../services/cloudinaryBusinessMediaService');

const clean = (value) => `${value ?? ''}`.trim();
const asBool = (value, fallback) => value === undefined ? fallback : value === true || value === 'true';
const asNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const assetPayload = (file, uploaded) => ({
  publicId: uploaded.public_id,
  format: uploaded.format,
  resourceType: uploaded.resource_type || 'image',
  deliveryType: uploaded.type || 'authenticated',
  originalName: file.originalname,
  mimeType: file.mimetype,
  size: uploaded.bytes || file.size,
});
const safeBusiness = (business) => {
  const value = business.toObject ? business.toObject() : business;
  const { logo, signature, ...fields } = value;
  return { ...fields, hasLogo: Boolean(logo?.publicId), hasSignature: Boolean(signature?.publicId) };
};

const getProfile = async (req, res) => {
  try {
    const [user, business] = await Promise.all([
      User.findById(req.userId).select('name email phone role createdAt').lean(),
      Business.findOne({ ownerId: req.userId }),
    ]);
    if (!user || !business) return res.status(404).json({ message: 'Profile not found' });
    return res.json({ user, business: safeBusiness(business) });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ message: 'Unable to load profile' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: 'New password must contain at least 8 characters',
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: 'New password must be different from the current password',
      });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'User account no longer exists',
      });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!passwordMatches) {
      return res.status(400).json({
        message: 'Current password is incorrect',
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    return res.status(200).json({
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'Unable to change password' });
  }
};

const updateProfile = async (req, res) => {
  const uploaded = {};
  try {
    const [user, business] = await Promise.all([
      User.findById(req.userId),
      Business.findOne({ ownerId: req.userId }),
    ]);
    if (!user || !business) return res.status(404).json({ message: 'Profile not found' });

    const ownerName = clean(req.body.ownerName);
    const businessName = clean(req.body.businessName);
    const phone = clean(req.body.phone);
    if (ownerName.length < 2) return res.status(400).json({ message: 'Owner name is required' });
    if (businessName.length < 3) return res.status(400).json({ message: 'Business name must contain at least 3 characters' });
    if (phone.length < 7) return res.status(400).json({ message: 'Enter a valid phone number' });
    const gstin = clean(req.body.gstin).toUpperCase();
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstin)) {
      return res.status(400).json({ message: 'Enter a valid 15-character GSTIN' });
    }
    const prefix = clean(req.body.invoicePrefix).toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!prefix || prefix.length > 12) return res.status(400).json({ message: 'Invoice prefix must use 1–12 letters, numbers or hyphens' });
    const taxPercent = asNumber(req.body.defaultTaxPercent, business.invoiceSettings?.defaultTaxPercent ?? 18);
    if (taxPercent < 0 || taxPercent > 100) return res.status(400).json({ message: 'Default tax must be between 0 and 100' });

    for (const kind of ['logo', 'signature']) {
      const file = req.files?.[kind]?.[0];
      if (!file) continue;
      uploaded[kind] = await uploadBusinessMedia({ buffer: file.buffer, businessId: business._id.toString(), kind, originalName: file.originalname });
    }

    const oldLogo = business.logo?.publicId ? business.logo.toObject() : null;
    const oldSignature = business.signature?.publicId ? business.signature.toObject() : null;
    user.name = ownerName;
    user.phone = phone;
    business.businessName = businessName;
    business.businessType = clean(req.body.businessType) || 'General';
    business.phone = phone;
    business.email = clean(req.body.businessEmail).toLowerCase();
    business.addressLine1 = clean(req.body.addressLine1);
    business.addressLine2 = clean(req.body.addressLine2);
    business.city = clean(req.body.city);
    business.state = clean(req.body.state);
    business.pincode = clean(req.body.pincode);
    business.gstin = gstin;
    business.pan = clean(req.body.pan).toUpperCase();
    business.bank = {
      accountName: clean(req.body.accountName), bankName: clean(req.body.bankName),
      accountNumber: clean(req.body.accountNumber), ifsc: clean(req.body.ifsc).toUpperCase(), upiId: clean(req.body.upiId),
    };
    business.invoiceSettings = {
      prefix, taxEnabled: asBool(req.body.taxEnabled, true), taxLabel: clean(req.body.taxLabel) || 'GST',
      defaultTaxPercent: taxPercent, terms: clean(req.body.terms), footerNote: clean(req.body.footerNote),
      accentColor: /^#[0-9A-F]{6}$/i.test(clean(req.body.accentColor)) ? clean(req.body.accentColor).toUpperCase() : '#2563EB',
      showLogo: asBool(req.body.showLogo, true), showSignature: asBool(req.body.showSignature, true),
      signatureLabel: clean(req.body.signatureLabel) || 'Authorized Signatory',
    };
    if (uploaded.logo) business.logo = assetPayload(req.files.logo[0], uploaded.logo);
    if (uploaded.signature) business.signature = assetPayload(req.files.signature[0], uploaded.signature);
    await Promise.all([user.save(), business.save()]);
    if (uploaded.logo && oldLogo) deleteBusinessMedia(oldLogo).catch((error) => console.error('Old logo cleanup error:', error));
    if (uploaded.signature && oldSignature) deleteBusinessMedia(oldSignature).catch((error) => console.error('Old signature cleanup error:', error));
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'profile_updated', category: 'Business', title: 'Business profile updated', description: `${business.businessName} profile and invoice settings were updated.`, entityType: 'Business', entityId: business._id, route: '/profile' });
    return res.json({
      message: 'Business profile updated successfully',
      user: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role },
      business: safeBusiness(business),
    });
  } catch (error) {
    for (const kind of Object.keys(uploaded)) {
      deleteBusinessMedia({ publicId: uploaded[kind].public_id, resourceType: uploaded[kind].resource_type, deliveryType: uploaded[kind].type }).catch(() => {});
    }
    console.error('Update profile error:', error);
    if (error?.code === 'CLOUDINARY_NOT_CONFIGURED' || Number.isFinite(error?.http_code)) return res.status(503).json({ message: 'Business image storage is unavailable or not configured' });
    return res.status(500).json({ message: 'Unable to update business profile' });
  }
};

const getMedia = (kind) => async (req, res) => {
  try {
    const business = await Business.findOne({ ownerId: req.userId }).select(kind);
    const asset = business?.[kind];
    if (!asset?.publicId) return res.status(404).json({ message: `${kind === 'logo' ? 'Logo' : 'Signature'} not found` });
    res.set('Cache-Control', 'private, no-store');
    return res.redirect(302, temporaryBusinessMediaUrl(asset));
  } catch (error) {
    console.error(`Get ${kind} error:`, error);
    return res.status(500).json({ message: `Unable to load ${kind}` });
  }
};

const removeMedia = (kind) => async (req, res) => {
  try {
    const business = await Business.findOne({ ownerId: req.userId });
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const asset = business[kind]?.publicId ? business[kind].toObject() : null;
    if (!asset) return res.status(404).json({ message: `${kind === 'logo' ? 'Logo' : 'Signature'} not found` });
    business[kind] = {};
    await business.save();
    await deleteBusinessMedia(asset);
    return res.json({ message: `${kind === 'logo' ? 'Logo' : 'Signature'} removed successfully` });
  } catch (error) {
    console.error(`Remove ${kind} error:`, error);
    return res.status(500).json({ message: `Unable to remove ${kind}` });
  }
};

module.exports = { changePassword, getProfile, updateProfile, getLogo: getMedia('logo'), getSignature: getMedia('signature'), removeLogo: removeMedia('logo'), removeSignature: removeMedia('signature') };
