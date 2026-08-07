const express = require('express');
const {
  listCustomers,
  getCustomerSummary,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} = require('../controllers/customerController');
const { protectCustomers } = require('../middleware/customerAuthMiddleware');

const router = express.Router();

router.use(protectCustomers);
router.get('/summary', getCustomerSummary);
router.get('/', listCustomers);
router.post('/', createCustomer);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

module.exports = router;
