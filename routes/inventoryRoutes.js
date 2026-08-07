const express = require('express');
const {
  adjustStock,
  createProduct,
  deleteProduct,
  getInventorySummary,
  getProducts,
  updateProduct,
} = require('../controllers/inventoryController');
const { protectInventory } = require('../middleware/inventoryAuthMiddleware');

const router = express.Router();

router.use(protectInventory);
router.get('/summary', getInventorySummary);
router.get('/', getProducts);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.patch('/:id/stock', adjustStock);
router.delete('/:id', deleteProduct);

module.exports = router;
