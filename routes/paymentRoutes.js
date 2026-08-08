const express = require('express');
const { createPaymentLink, listPayments, getPayment } = require('../controllers/paymentController');
const { protectPayments } = require('../middleware/paymentAuthMiddleware');

const router = express.Router();
router.use(protectPayments);
router.get('/', listPayments);
router.get('/:id', getPayment);
router.post('/links/:invoiceId', createPaymentLink);

module.exports = router;
