const { google } = require('googleapis');

const requiredEmailVariables = [
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_SENDER_EMAIL',
];

const emailIsConfigured = () =>
  requiredEmailVariables.every(
    (key) => Boolean(process.env[key]?.trim()),
  );

let gmailClient;

const getGmailClient = () => {
  if (!emailIsConfigured()) {
    throw new Error('Gmail API environment variables are missing');
  }

  if (gmailClient) {
    return gmailClient;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID.trim(),
    process.env.GMAIL_CLIENT_SECRET.trim(),
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN.trim(),
  });

  gmailClient = google.gmail({
    version: 'v1',
    auth: oauth2Client,
  });

  return gmailClient;
};

const encodeBase64Url = (value) =>
  Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const encodeMimePart = (value = '') => {
  const encoded = Buffer.from(String(value), 'utf8').toString('base64');

  return encoded.match(/.{1,76}/g)?.join('\r\n') || '';
};

const encodeSubject = (subject = '') =>
  `=?UTF-8?B?${Buffer.from(
    String(subject),
    'utf8',
  ).toString('base64')}?=`;

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const sendMail = async ({
  to,
  subject,
  text,
  html,
}) => {
  if (!emailIsConfigured()) {
    throw new Error('Gmail API environment variables are missing');
  }

  const recipient = String(to || '').trim();
  const sender = process.env.GMAIL_SENDER_EMAIL.trim();

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    !recipient ||
    /[\r\n]/.test(recipient) ||
    !emailPattern.test(recipient)
  ) {
    throw new Error('Invalid recipient email address');
  }

  if (
    !sender ||
    /[\r\n]/.test(sender) ||
    !emailPattern.test(sender)
  ) {
    throw new Error('Invalid Gmail sender email address');
  }

  const boundary = `workpilot_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

  const mimeMessage = [
    `From: WorkPilot <${sender}>`,
    `To: ${recipient}`,
    `Reply-To: ${sender}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimePart(text),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimePart(html),
    '',
    `--${boundary}--`,
  ].join('\r\n');

  try {
    const gmail = getGmailClient();

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodeBase64Url(mimeMessage),
      },
    });

    console.log('Gmail sent successfully:', {
      messageId: response.data.id,
      recipient,
    });

    return response.data;
  } catch (error) {
    console.error('Gmail API email error:', {
      message: error.message,
      code: error.code,
      recipient,
    });

    throw error;
  }
};

const sendWelcomeEmail = async ({
  to,
  ownerName,
  businessName,
}) => {
  const displayOwnerName = String(ownerName || 'there').trim();
  const displayBusinessName = String(
    businessName || 'your business',
  ).trim();

  const safeOwnerName = escapeHtml(displayOwnerName);
  const safeBusinessName = escapeHtml(displayBusinessName);

  return sendMail({
    to,
    subject: `Welcome to WorkPilot, ${displayOwnerName}!`,

    text: `
Hi ${displayOwnerName},

Welcome to WorkPilot!

Your ${displayBusinessName} workspace has been created successfully.

You can now manage customers, inventory, invoices, payments, expenses, tasks and business reports from one convenient workspace.

We are excited to be part of your business journey.

Best regards,
The WorkPilot Team
    `.trim(),

    html: `
<!DOCTYPE html>
<html lang="en">
  <body
    style="
      margin:0;
      padding:0;
      background:#f1f5f9;
      font-family:Arial,sans-serif;
      color:#111827;
    "
  >
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#f1f5f9;padding:30px 12px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="
              max-width:600px;
              background:#ffffff;
              border-radius:18px;
              overflow:hidden;
            "
          >
            <tr>
              <td
                align="center"
                style="
                  background:#2563eb;
                  padding:34px 24px;
                  color:#ffffff;
                "
              >
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
                  Hi ${safeOwnerName},
                </h2>

                <p
                  style="
                    margin:0;
                    font-size:16px;
                    line-height:1.7;
                    color:#475569;
                  "
                >
                  Great news! Your
                  <strong style="color:#2563eb;">
                    ${safeBusinessName}
                  </strong>
                  workspace has been created successfully.
                </p>

                <div
                  style="
                    background:#eff6ff;
                    padding:20px;
                    border-radius:12px;
                    margin:22px 0;
                  "
                >
                  <p
                    style="
                      margin:0 0 10px;
                      font-weight:bold;
                      color:#1e3a8a;
                    "
                  >
                    You can now manage:
                  </p>

                  <p style="margin:7px 0;color:#334155;">
                    ✓ Customers and contacts
                  </p>

                  <p style="margin:7px 0;color:#334155;">
                    ✓ Inventory and stock
                  </p>

                  <p style="margin:7px 0;color:#334155;">
                    ✓ Invoices and payments
                  </p>

                  <p style="margin:7px 0;color:#334155;">
                    ✓ Expenses and tasks
                  </p>

                  <p style="margin:7px 0;color:#334155;">
                    ✓ Business reports and insights
                  </p>
                </div>

                <p
                  style="
                    font-size:15px;
                    line-height:1.7;
                    color:#475569;
                  "
                >
                  We’re excited to be part of your business journey.
                </p>

                <p style="margin-top:24px;color:#0f172a;">
                  Best regards,<br>
                  <strong>The WorkPilot Team</strong>
                </p>
              </td>
            </tr>

            <tr>
              <td
                align="center"
                style="
                  background:#f8fafc;
                  border-top:1px solid #e2e8f0;
                  padding:18px;
                "
              >
                <p
                  style="
                    margin:0;
                    font-size:12px;
                    line-height:1.6;
                    color:#94a3b8;
                  "
                >
                  This email was sent because a WorkPilot account
                  was created using this email address.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `.trim(),
  });
};

const sendPasswordResetOtp = async ({
  to,
  ownerName,
  otp,
}) => {
  const displayOwnerName = String(ownerName || 'there').trim();
  const displayOtp = String(otp || '').trim();

  if (!displayOtp) {
    throw new Error('Password-reset OTP is missing');
  }

  const safeOwnerName = escapeHtml(displayOwnerName);
  const safeOtp = escapeHtml(displayOtp);

  return sendMail({
    to,
    subject: 'Your WorkPilot password reset code',

    text: `
Hi ${displayOwnerName},

Your WorkPilot password reset code is:

${displayOtp}

This code expires in 10 minutes.

If you did not request a password reset, you can safely ignore this email.

Best regards,
The WorkPilot Team
    `.trim(),

    html: `
<!DOCTYPE html>
<html lang="en">
  <body
    style="
      margin:0;
      padding:0;
      background:#f1f5f9;
      font-family:Arial,sans-serif;
      color:#111827;
    "
  >
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#f1f5f9;padding:30px 12px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="
              max-width:600px;
              background:#ffffff;
              border-radius:18px;
              overflow:hidden;
            "
          >
            <tr>
              <td
                align="center"
                style="
                  background:#2563eb;
                  padding:30px 24px;
                  color:#ffffff;
                "
              >
                <h1 style="margin:0;font-size:26px;">
                  Reset your password
                </h1>

                <p style="margin:10px 0 0;color:#dbeafe;">
                  WorkPilot account security
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:34px 30px;">
                <h2 style="margin:0 0 15px;color:#0f172a;">
                  Hi ${safeOwnerName},
                </h2>

                <p
                  style="
                    font-size:16px;
                    line-height:1.7;
                    color:#475569;
                  "
                >
                  Use this one-time code to reset your WorkPilot
                  password:
                </p>

                <div
                  style="
                    margin:24px 0;
                    padding:18px;
                    background:#eff6ff;
                    color:#2563eb;
                    border-radius:12px;
                    text-align:center;
                    font-size:32px;
                    font-weight:700;
                    letter-spacing:8px;
                  "
                >
                  ${safeOtp}
                </div>

                <p
                  style="
                    font-size:15px;
                    line-height:1.7;
                    color:#475569;
                  "
                >
                  This code expires in 10 minutes. If you did not
                  request a password reset, you can safely ignore
                  this email.
                </p>

                <p style="margin-top:24px;color:#0f172a;">
                  Best regards,<br>
                  <strong>The WorkPilot Team</strong>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `.trim(),
  });
};

module.exports = {
  emailIsConfigured,
  sendWelcomeEmail,
  sendPasswordResetOtp,
};