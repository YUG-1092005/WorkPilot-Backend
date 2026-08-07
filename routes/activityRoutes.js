const express = require('express');
const { listActivities } = require('../controllers/activityController');
const { protectActivities } = require('../middleware/activityAuthMiddleware');
const router = express.Router();
router.use(protectActivities);
router.get('/', listActivities);
module.exports = router;
