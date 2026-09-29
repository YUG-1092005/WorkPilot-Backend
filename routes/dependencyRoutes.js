const express = require('express');
const { getDependencyMap } = require('../controllers/dependencyController');
const { protectSales } = require('../middleware/salesAuthMiddleware');

const router = express.Router();

router.use(protectSales);
router.get('/', getDependencyMap);

module.exports = router;
