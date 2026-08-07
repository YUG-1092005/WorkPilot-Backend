const Razorpay = require('razorpay');

let client;

const isRazorpayConfigured = () => Boolean(
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
);

const getRazorpayClient = () => {
  if (!isRazorpayConfigured()) {
    const error = new Error('Razorpay is not configured on the server');
    error.code = 'RAZORPAY_NOT_CONFIGURED';
    throw error;
  }
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
};

const razorpayMode = () => (
  `${process.env.RAZORPAY_KEY_ID || ''}`.startsWith('rzp_live_') ? 'live' : 'test'
);

module.exports = { getRazorpayClient, isRazorpayConfigured, razorpayMode };
