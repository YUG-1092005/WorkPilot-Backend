const nodemailer = require('nodemailer');
const dns = require('node:dns');
const { google } = require('googleapis');


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


const emailIsConfigured = () =>
  Boolean(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN &&
    process.env.GMAIL_SENDER_EMAIL
  );

const getGmailClient = () => {
  if (!emailIsConfigured()) {
    throw new Error('Gmail API environment variables are missing');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID.trim(),
    process.env.GMAIL_CLIENT_SECRET.trim()
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN.trim(),
  });

  return google.gmail({
    version: 'v1',
    auth: oauth2Client,
  });
};

const encodeBase64Url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const sendMail = async ({ to, subject, text, html }) => {
  const sender = process.env.GMAIL_SENDER_EMAIL.trim();
  const boundary = `workpilot_${Date.now()}`;

  const message = [
    `From: WorkPilot <${sender}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const gmail = getGmailClient();

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodeBase64Url(message),
    },
  });

  console.log('Gmail sent successfully:', {
    messageId: response.data.id,
    recipient: to,
  });

  return response.data;
};

const sendWelcomeEmail = async ({
  to,
  ownerName,
  businessName,
}) => {
  return sendMail({
    to,
    subject: `Welcome to WorkPilot, ${ownerName}!`,

    text: `
Hi ${ownerName},

Welcome to WorkPilot!

Your ${businessName} workspace has been created successfully.

You can now manage your business activities from one simple workspace.

Best regards,
The WorkPilot Team
    `.trim(),

    html: `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
          <table width="100%" cellspacing="0" cellpadding="0"
                 style="background:#f1f5f9;padding:30px 12px;">
            <tr>
              <td align="center">
                <table width="100%" cellspacing="0" cellpadding="0"
                       style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;">

                  <tr>
                    <td align="center"
                        style="background:#2563eb;padding:34px 24px;color:#ffffff;">
                      <h1 style="margin:0;font-size:28px;">
                        Welcome to WorkPilot!
                      </h1>
                      <p style="margin:10px 0 0;color:#dbeafe;">
                        Run your entire business from one app
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:34px 30px;">
                      <h2 style="margin:0 0 15px;color:#0f172a;">
                        Hi ${ownerName},
                      </h2>

                      <p style="font-size:16px;line-height:1.7;color:#475569;">
                        Great news! Your
                        <strong style="color:#2563eb;">${businessName}</strong>
                        workspace has been created successfully.
                      </p>

                      <div style="background:#eff6ff;padding:20px;border-radius:12px;margin:22px 0;">
                        <p style="margin:0 0 10px;font-weight:bold;color:#1e3a8a;">
                          You can now manage:
                        </p>
                        <p style="margin:7px 0;color:#334155;">✓ Customers and contacts</p>
                        <p style="margin:7px 0;color:#334155;">✓ Inventory and stock</p>
                        <p style="margin:7px 0;color:#334155;">✓ Invoices and payments</p>
                        <p style="margin:7px 0;color:#334155;">✓ Expenses and tasks</p>
                        <p style="margin:7px 0;color:#334155;">✓ Business insights</p>
                      </div>

                      <p style="font-size:15px;line-height:1.7;color:#475569;">
                        We’re excited to be part of your business journey.
                      </p>

                      <p style="margin-top:24px;color:#0f172a;">
                        Best regards,<br>
                        <strong>The WorkPilot Team</strong>
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td align="center"
                        style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px;">
                      <p style="margin:0;font-size:12px;color:#94a3b8;">
                        This email was sent because a WorkPilot account was created using this address.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
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
  sendWelcomeEmail,
  sendPasswordResetOtp,
};
