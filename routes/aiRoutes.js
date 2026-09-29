const express = require('express');

const protect = require('../middleware/authMiddleware');
const { chat } = require('../controllers/aiController');

const router = express.Router();

router.use(protect);

router.post('/chat', chat);

module.exports = router;