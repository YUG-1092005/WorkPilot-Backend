const nodemailer = require('nodemailer');
const dns = require('node:dns');

// Prefer IPv4 without manually replacing the SMTP hostname with an IP.
dns.setDefaultResultOrder('ipv4first');

const requiredEmailVariables = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
];

const emailIsConfigured = () => {
  return requiredEmailVariables.every((key) => process.env[key]?.trim());
};

let transporter;

const createTransporter = () => {
  if (!emailIsConfigured()) {
    throw new Error('Email service is not configured');
  }

  if (transporter) {
    return transporter;
  }

  const smtpPort = Number(process.env.SMTP_PORT);

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port: smtpPort,
    secure: smtpPort === 465,

    requireTLS: smtpPort === 587,

    auth: {
      user: process.env.SMTP_USER.trim(),
      pass: process.env.SMTP_PASS.trim(),
    },

    tls: {
      minVersion: 'TLSv1.2',
    },

    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  return transporter;
};

const sendMail = async ({ to, subject, html, text }) => {
  try {
    const mailTransporter = createTransporter();

    return await mailTransporter.sendMail({
      from:
        process.env.EMAIL_FROM ||
        `WorkPilot <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error('Email sending failed:', {
      code: error.code,
      command: error.command,
      message: error.message,
      response: error.response,
    });

    throw error;
  }
};

const sendWelcomeEmail = async ({ to, ownerName, businessName }) => {
  return sendMail({
    to,
    subject: 'Welcome to WorkPilot',
    text: `Welcome to WorkPilot, ${ownerName}! Your ${businessName} workspace is ready.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111827">
        <div style="background:#2563eb;padding:24px;border-radius:14px 14px 0 0;color:white">
          <h1 style="margin:0;font-size:25px">Welcome to WorkPilot</h1>
        </div>
        <div style="padding:28px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 14px 14px">
          <h2 style="margin-top:0">Hi ${ownerName},</h2>
          <p>Your <strong>${businessName}</strong> workspace has been created successfully.</p>
          <p>You can now manage your business from one simple workspace.</p>
          <p style="margin-bottom:0">— The WorkPilot Team</p>
        </div>
      </div>
    `,
  });
};

const sendPasswordResetOtp = async ({ to, ownerName, otp }) => {
  return sendMail({
    to,
    subject: 'Your WorkPilot password reset code',
    text: `Hi ${ownerName}, your WorkPilot password reset code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111827">
        <h2>Reset your WorkPilot password</h2>
        <p>Hi ${ownerName}, use this one-time code to reset your password:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#eff6ff;color:#2563eb;padding:18px;text-align:center;border-radius:12px">${otp}</div>
        <p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
      </div>
    `,
  });
};

module.exports = {
  emailIsConfigured,
  sendPasswordResetOtp,
  sendWelcomeEmail,
};
