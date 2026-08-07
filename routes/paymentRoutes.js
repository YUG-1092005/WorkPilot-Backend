const express = require('express');
const {
  createOrder,
  verifyPayment,
  recordFailure,
  listPayments,
  getPayment,
} = require('../controllers/paymentController');
const { protectPayments } = require('../middleware/paymentAuthMiddleware');

const router = express.Router();
router.use(protectPayments);
router.get('/', listPayments);
router.get('/:id', getPayment);
router.post('/orders/:invoiceId', createOrder);
router.post('/verify', verifyPayment);
router.post('/failure', recordFailure);

module.exports = router;
