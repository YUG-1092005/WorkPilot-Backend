const express = require('express');

let auth;
try {
  auth = require('../middleware/authMiddleware');
} catch (_) {
  auth = require('../middleware/auth');
}

if (auth && typeof auth !== 'function') {
  auth = auth.authMiddleware || auth.auth || auth.verifyToken || auth;
}

const { sendPaymentReminderHttp } = require('../controllers/smsController');

const router = express.Router();

router.post('/payment-reminder', auth, sendPaymentReminderHttp);

module.exports = router;
