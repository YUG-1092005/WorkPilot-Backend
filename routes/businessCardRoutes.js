const express = require('express');
const { protectProfile } = require('../middleware/profileAuthMiddleware');
const {
  getOrCreateCard,
  updateCard,
  getStats,
  captureLead,
} = require('../controllers/businessCardController');

const router = express.Router();

router.get('/', protectProfile, getOrCreateCard);
router.put('/', protectProfile, updateCard);
router.get('/stats', protectProfile, getStats);
router.post('/public/:slug/lead', captureLead);

module.exports = router;
