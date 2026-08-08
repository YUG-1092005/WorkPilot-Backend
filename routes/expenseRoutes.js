const express = require('express');
const {
  listExpenses,
  getExpenseSummary,
  createExpense,
  updateExpense,
  markExpensePaid,
  deleteExpense,
  getReceipt,
  deleteReceipt,
} = require('../controllers/expenseController');
const { protectExpenses } = require('../middleware/expenseAuthMiddleware');
const { uploadReceipt } = require('../middleware/expenseUpload');

const router = express.Router();
router.use(protectExpenses);

const uploadOne = (req, res, next) => {
  uploadReceipt.single('receipt')(req, res, (error) => {
    if (!error) return next();
    return res.status(400).json({ message: error.message || 'Unable to upload receipt' });
  });
};

router.get('/summary', getExpenseSummary);
router.get('/', listExpenses);
router.post('/', uploadOne, createExpense);
router.patch('/:id', uploadOne, updateExpense);
router.patch('/:id/mark-paid', markExpensePaid);
router.get('/:id/receipt', getReceipt);
router.delete('/:id/receipt', deleteReceipt);
router.delete('/:id', deleteExpense);

module.exports = router;
