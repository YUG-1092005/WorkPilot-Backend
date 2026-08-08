//const bcrypt = require('bcryptjs');
//const crypto = require('crypto');
//const jwt = require('jsonwebtoken');
//const User = require('../models/User');
//const Business = require('../models/Business');
//const {
//  sendPasswordResetOtp,
//  sendWelcomeEmail,
//} = require('../services/emailService');
//
//const RESET_OTP_VALIDITY_MS = 10 * 60 * 1000;
//const RESET_OTP_RESEND_WAIT_MS = 60 * 1000;
//const MAX_OTP_ATTEMPTS = 5;
//
//const createToken = (userId) => {
//  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
//};
//
//const hashOtp = (email, otp) => {
//  return crypto
//    .createHash('sha256')
//    .update(`${email}:${otp}:${process.env.JWT_SECRET}`)
//    .digest('hex');
//};
//
//const safeOtpMatch = (storedHash, suppliedHash) => {
//  if (!storedHash || storedHash.length !== suppliedHash.length) return false;
//  return crypto.timingSafeEqual(
//    Buffer.from(storedHash, 'hex'),
//    Buffer.from(suppliedHash, 'hex'),
//  );
//};
//
//const publicUser = (user) => ({
//  id: user._id,
//  name: user.name,
//  email: user.email,
//  phone: user.phone,
//  role: user.role,
//  profileImage: user.profileImage,
//});
//
//const publicBusiness = (business) => {
//  if (!business) return null;
//  return {
//    id: business._id,
//    businessName: business.businessName,
//    businessType: business.businessType,
//  };
//};
//
//const register = async (req, res) => {
//  try {
//    const { ownerName, businessName, email, phone, password } = req.body;
//
//    if (!ownerName || !businessName || !email || !phone || !password) {
//      return res.status(400).json({ message: 'All fields are required' });
//    }
//
//    if (password.length < 8) {
//      return res.status(400).json({
//        message: 'Password must contain at least 8 characters',
//      });
//    }
//
//    const normalizedEmail = email.trim().toLowerCase();
//    const existingUser = await User.findOne({ email: normalizedEmail });
//
//    if (existingUser) {
//      return res.status(409).json({
//        message: 'An account already exists with this email',
//      });
//    }
//
//    const passwordHash = await bcrypt.hash(password, 12);
//    const user = await User.create({
//      name: ownerName.trim(),
//      email: normalizedEmail,
//      phone: phone.trim(),
//      passwordHash,
//      authProvider: 'local',
//      role: 'Owner',
//    });
//
//    let business;
//
//    try {
//      business = await Business.create({
//        ownerId: user._id,
//        businessName: businessName.trim(),
//        phone: phone.trim(),
//        businessType: 'Retail',
//      });
//    } catch (error) {
//      await User.findByIdAndDelete(user._id);
//      throw error;
//    }
//
//    let welcomeEmailSent = true;
//
//    try {
//      await sendWelcomeEmail({
//        to: user.email,
//        ownerName: user.name,
//        businessName: business.businessName,
//      });
//    } catch (emailError) {
//      welcomeEmailSent = false;
//      console.error('Welcome email error:', emailError.message);
//    }
//
//    return res.status(201).json({
//      message: welcomeEmailSent
//        ? 'Account created successfully. Welcome email sent.'
//        : 'Account created successfully.',
//      token: createToken(user._id),
//      user: publicUser(user),
//      business: publicBusiness(business),
//      welcomeEmailSent,
//    });
//  } catch (error) {
//    console.error('Register error:', error);
//
//    if (error.code === 11000) {
//      return res.status(409).json({
//        message: 'An account already exists with this email',
//      });
//    }
//
//    return res.status(500).json({ message: 'Unable to create account' });
//  }
//};
//
//const login = async (req, res) => {
//  try {
//    const { email, password } = req.body;
//
//    if (!email || !password) {
//      return res.status(400).json({
//        message: 'Email and password are required',
//      });
//    }
//
//    const normalizedEmail = email.trim().toLowerCase();
//    const user = await User.findOne({ email: normalizedEmail });
//
//    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
//      return res.status(401).json({ message: 'Invalid email or password' });
//    }
//
//    const business = await Business.findOne({ ownerId: user._id });
//
//    return res.status(200).json({
//      message: 'Login successful',
//      token: createToken(user._id),
//      user: publicUser(user),
//      business: publicBusiness(business),
//    });
//  } catch (error) {
//    console.error('Login error:', error);
//    return res.status(500).json({ message: 'Unable to login' });
//  }
//};
//
//const forgotPassword = async (req, res) => {
//  const genericMessage =
//    'If an account exists with this email, a 6-digit code has been sent.';
//
//  try {
//    const normalizedEmail = req.body.email?.trim().toLowerCase();
//
//    if (!normalizedEmail) {
//      return res.status(400).json({ message: 'Email is required' });
//    }
//
//    const user = await User.findOne({ email: normalizedEmail }).select(
//      '+passwordResetOtpHash +passwordResetOtpExpires +passwordResetOtpAttempts +passwordResetOtpLastSentAt',
//    );
//
//    if (!user) {
//      return res.status(200).json({ message: genericMessage });
//    }
//
//    const now = Date.now();
//    const lastSentAt = user.passwordResetOtpLastSentAt?.getTime() ?? 0;
//
//    if (now - lastSentAt < RESET_OTP_RESEND_WAIT_MS) {
//      return res.status(429).json({
//        message: 'Please wait one minute before requesting another code.',
//      });
//    }
//
//    const otp = crypto.randomInt(100000, 1000000).toString();
//    user.passwordResetOtpHash = hashOtp(normalizedEmail, otp);
//    user.passwordResetOtpExpires = new Date(now + RESET_OTP_VALIDITY_MS);
//    user.passwordResetOtpAttempts = 0;
//    user.passwordResetOtpLastSentAt = new Date(now);
//    await user.save();
//
//    try {
//      await sendPasswordResetOtp({
//        to: user.email,
//        ownerName: user.name,
//        otp,
//      });
//    } catch (emailError) {
//      user.passwordResetOtpHash = null;
//      user.passwordResetOtpExpires = null;
//      user.passwordResetOtpAttempts = 0;
//      await user.save();
//      console.error('Password reset email error:', emailError.message);
//      return res.status(500).json({
//        message: 'Unable to send the reset email. Please try again later.',
//      });
//    }
//
//    return res.status(200).json({ message: genericMessage });
//  } catch (error) {
//    console.error('Forgot password error:', error);
//    return res.status(500).json({
//      message: 'Unable to process the password reset request',
//    });
//  }
//};
//
//const resetPassword = async (req, res) => {
//  try {
//    const { email, otp, newPassword } = req.body;
//    const normalizedEmail = email?.trim().toLowerCase();
//
//    if (!normalizedEmail || !otp || !newPassword) {
//      return res.status(400).json({
//        message: 'Email, OTP and new password are required',
//      });
//    }
//
//    if (!/^\d{6}$/.test(otp.toString())) {
//      return res.status(400).json({ message: 'Enter a valid 6-digit code' });
//    }
//
//    if (newPassword.length < 8) {
//      return res.status(400).json({
//        message: 'New password must contain at least 8 characters',
//      });
//    }
//
//    const user = await User.findOne({ email: normalizedEmail }).select(
//      '+passwordResetOtpHash +passwordResetOtpExpires +passwordResetOtpAttempts',
//    );
//
//    if (
//      !user ||
//      !user.passwordResetOtpHash ||
//      !user.passwordResetOtpExpires
//    ) {
//      return res.status(400).json({
//        message: 'Invalid or expired reset code',
//      });
//    }
//
//    if (user.passwordResetOtpExpires.getTime() < Date.now()) {
//      user.passwordResetOtpHash = null;
//      user.passwordResetOtpExpires = null;
//      user.passwordResetOtpAttempts = 0;
//      await user.save();
//      return res.status(400).json({
//        message: 'Reset code has expired. Request a new code.',
//      });
//    }
//
//    if (user.passwordResetOtpAttempts >= MAX_OTP_ATTEMPTS) {
//      return res.status(429).json({
//        message: 'Too many incorrect attempts. Request a new code.',
//      });
//    }
//
//    const suppliedHash = hashOtp(normalizedEmail, otp.toString());
//
//    if (!safeOtpMatch(user.passwordResetOtpHash, suppliedHash)) {
//      user.passwordResetOtpAttempts += 1;
//      await user.save();
//      return res.status(400).json({ message: 'Invalid reset code' });
//    }
//
//    user.passwordHash = await bcrypt.hash(newPassword, 12);
//    user.passwordResetOtpHash = null;
//    user.passwordResetOtpExpires = null;
//    user.passwordResetOtpAttempts = 0;
//    user.passwordResetOtpLastSentAt = null;
//    await user.save();
//
//    return res.status(200).json({
//      message: 'Password reset successfully. Please sign in.',
//    });
//  } catch (error) {
//    console.error('Reset password error:', error);
//    return res.status(500).json({ message: 'Unable to reset password' });
//  }
//};
//
//module.exports = {
//  forgotPassword,
//  login,
//  register,
//  resetPassword,
//};

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Business = require('../models/Business');
const {
  sendPasswordResetOtp,
  sendWelcomeEmail,
} = require('../services/emailService');

const RESET_OTP_VALIDITY_MS = 10 * 60 * 1000;
const RESET_OTP_RESEND_WAIT_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const createToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const hashOtp = (email, otp) => {
  return crypto
    .createHash('sha256')
    .update(`${email}:${otp}:${process.env.JWT_SECRET}`)
    .digest('hex');
};

const safeOtpMatch = (storedHash, suppliedHash) => {
  if (!storedHash || storedHash.length !== suppliedHash.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(storedHash, 'hex'),
    Buffer.from(suppliedHash, 'hex'),
  );
};

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  profileImage: user.profileImage,
});

const publicBusiness = (business) => {
  if (!business) return null;
  return {
    id: business._id,
    businessName: business.businessName,
    businessType: business.businessType,
  };
};

const register = async (req, res) => {
  try {
    const { ownerName, businessName, email, phone, password } = req.body;

    if (!ownerName || !businessName || !email || !phone || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must contain at least 8 characters',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        message: 'An account already exists with this email',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: ownerName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      passwordHash,
      authProvider: 'local',
      role: 'Owner',
    });

    let business;

    try {
      business = await Business.create({
        ownerId: user._id,
        businessName: businessName.trim(),
        phone: phone.trim(),
        businessType: 'Retail',
      });
    } catch (error) {
      await User.findByIdAndDelete(user._id);
      throw error;
    }

    const token = createToken(user._id);

    // Return success immediately to Flutter
    res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: publicUser(user),
      business: publicBusiness(business),
    });

    // Send welcome email separately
    setImmediate(() => {
      sendWelcomeEmail({
        to: user.email,
        ownerName: user.name,
        businessName: business.businessName,
      }).catch((emailError) => {
        console.error('Welcome email error:', emailError.message);
      });
    });
    return;
  } catch (error) {
    console.error('Register error:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'An account already exists with this email',
      });
    }

    return res.status(500).json({ message: 'Unable to create account' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const business = await Business.findOne({ ownerId: user._id });

    return res.status(200).json({
      message: 'Login successful',
      token: createToken(user._id),
      user: publicUser(user),
      business: publicBusiness(business),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Unable to login' });
  }
};

const forgotPassword = async (req, res) => {
  const genericMessage =
    'If an account exists with this email, a 6-digit code has been sent.';

  try {
    const normalizedEmail = req.body.email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: normalizedEmail }).select(
      '+passwordResetOtpHash +passwordResetOtpExpires +passwordResetOtpAttempts +passwordResetOtpLastSentAt',
    );

    if (!user) {
      return res.status(200).json({ message: genericMessage });
    }

    const now = Date.now();
    const lastSentAt = user.passwordResetOtpLastSentAt?.getTime() ?? 0;

    if (now - lastSentAt < RESET_OTP_RESEND_WAIT_MS) {
      return res.status(429).json({
        message: 'Please wait one minute before requesting another code.',
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    user.passwordResetOtpHash = hashOtp(normalizedEmail, otp);
    user.passwordResetOtpExpires = new Date(now + RESET_OTP_VALIDITY_MS);
    user.passwordResetOtpAttempts = 0;
    user.passwordResetOtpLastSentAt = new Date(now);
    await user.save();

    try {
      await sendPasswordResetOtp({
        to: user.email,
        ownerName: user.name,
        otp,
      });
    } catch (emailError) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpires = null;
      user.passwordResetOtpAttempts = 0;
      await user.save();
      console.error('Password reset email error:', emailError.message);
      return res.status(500).json({
        message: 'Unable to send the reset email. Please try again later.',
      });
    }

    return res.status(200).json({ message: genericMessage });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      message: 'Unable to process the password reset request',
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !otp || !newPassword) {
      return res.status(400).json({
        message: 'Email, OTP and new password are required',
      });
    }

    if (!/^\d{6}$/.test(otp.toString())) {
      return res.status(400).json({ message: 'Enter a valid 6-digit code' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: 'New password must contain at least 8 characters',
      });
    }

    const user = await User.findOne({ email: normalizedEmail }).select(
      '+passwordResetOtpHash +passwordResetOtpExpires +passwordResetOtpAttempts',
    );

    if (
      !user ||
      !user.passwordResetOtpHash ||
      !user.passwordResetOtpExpires
    ) {
      return res.status(400).json({
        message: 'Invalid or expired reset code',
      });
    }

    if (user.passwordResetOtpExpires.getTime() < Date.now()) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpires = null;
      user.passwordResetOtpAttempts = 0;
      await user.save();
      return res.status(400).json({
        message: 'Reset code has expired. Request a new code.',
      });
    }

    if (user.passwordResetOtpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({
        message: 'Too many incorrect attempts. Request a new code.',
      });
    }

    const suppliedHash = hashOtp(normalizedEmail, otp.toString());

    if (!safeOtpMatch(user.passwordResetOtpHash, suppliedHash)) {
      user.passwordResetOtpAttempts += 1;
      await user.save();
      return res.status(400).json({ message: 'Invalid reset code' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpires = null;
    user.passwordResetOtpAttempts = 0;
    user.passwordResetOtpLastSentAt = null;
    await user.save();

    return res.status(200).json({
      message: 'Password reset successfully. Please sign in.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Unable to reset password' });
  }
};

module.exports = {
  forgotPassword,
  login,
  register,
  resetPassword,
};
