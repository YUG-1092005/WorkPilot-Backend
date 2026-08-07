const express = require('express');
const {
  listInvoices,
  getSalesSummary,
  getInvoice,
  getCustomerInvoices,
  createInvoice,
  collectPayment,
  cancelInvoice,
} = require('../controllers/salesController');
const { protectSales } = require('../middleware/salesAuthMiddleware');

const router = express.Router();

router.use(protectSales);
router.get('/summary', getSalesSummary);
router.get('/customer/:customerId', getCustomerInvoices);
router.get('/', listInvoices);
router.post('/', createInvoice);
router.get('/:id', getInvoice);
router.patch('/:id/payment', collectPayment);
router.patch('/:id/cancel', cancelInvoice);

module.exports = router;
