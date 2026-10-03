const SMS_GATEWAY_BASE_URL = (
  process.env.SMSGATE_API_BASE_URL || 'https://api.sms-gate.app'
).replace(/\/$/, '');

const SMS_GATEWAY_USERNAME = process.env.SMSGATE_USERNAME;
const SMS_GATEWAY_PASSWORD = process.env.SMSGATE_PASSWORD;
const SMS_GATEWAY_DEVICE_ID = process.env.SMSGATE_DEVICE_ID;

const buildBasicAuth = () => {
  if (!(SMS_GATEWAY_USERNAME && SMS_GATEWAY_PASSWORD)) {
    throw new Error(
      'SMSGATE_USERNAME and SMSGATE_PASSWORD are required'
    );
  }

  return `Basic ${Buffer.from(
    `${SMS_GATEWAY_USERNAME}:${SMS_GATEWAY_PASSWORD}`
  ).toString('base64')}`;
};


const normalizeIndianPhone = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return '';

  if (raw.startsWith('+')) return raw;

  const digits = raw.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.startsWith('91') && digits.length === 12) {
    return `+${digits}`;
  }

  throw new Error('Invalid customer phone number');
};

const sendSms = async ({ phone, message }) => {
  const normalizedPhone = normalizeIndianPhone(phone);

  if (!message || !String(message).trim()) {
    throw new Error('SMS message is required');
  }

  const url = `${SMS_GATEWAY_BASE_URL}/3rdparty/v1/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: buildBasicAuth(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      textMessage: {
        text: String(message).trim(),
      },
      phoneNumbers: [normalizedPhone],
      simNumber: 2
    }),
  });

  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (_) {
    data = { raw };
  }

  if (!response.ok) {
    const providerMessage =
      data?.message ||
      data?.error ||
      data?.detail ||
      raw ||
      `SMS gateway returned ${response.status}`;

    throw new Error(`SMS gateway error: ${providerMessage}`);
  }

  return {
    success: true,
    phoneNumber: normalizedPhone,
    providerStatus: response.status,
    providerResponse: data,
  };
};

module.exports = {
  normalizeIndianPhone,
  sendSms,
};
