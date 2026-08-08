const express = require('express');
const {
  clearReadNotifications,
  deleteNotification,
  getNotificationSummary,
  getNotifications,
  markAllAsRead,
  markAsRead,
  registerDevice,
  unregisterDevice,
} = require('../controllers/notificationController');
const { protectInventory } = require('../middleware/inventoryAuthMiddleware');

const router = express.Router();

router.use(protectInventory);
router.post('/devices', registerDevice);
router.delete('/devices', unregisterDevice);
router.get('/summary', getNotificationSummary);
router.get('/', getNotifications);
router.patch('/read-all', markAllAsRead);
router.delete('/clear-read', clearReadNotifications);
router.patch('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

module.exports = router;
