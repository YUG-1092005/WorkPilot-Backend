const express = require('express');
const { getReport } = require('../controllers/reportController');
const { protectReports } = require('../middleware/reportAuthMiddleware');

const router = express.Router();
router.use(protectReports);
router.get('/', getReport);

module.exports = router;
