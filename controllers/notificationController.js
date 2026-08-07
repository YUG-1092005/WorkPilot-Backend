const mongoose = require('mongoose');
const AppNotification = require('../models/AppNotification');
const Business = require('../models/Business');
const {
  syncInventoryNotifications,
} = require('../services/inventoryNotificationService');
const { syncTaskNotifications } = require('../services/taskReminderService');

const getBusiness = async (userId) => Business.findOne({ ownerId: userId }).select('_id');

const getNotifications = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    await Promise.all([
      syncInventoryNotifications({ businessId: business._id, ownerId: req.userId }),
      syncTaskNotifications({ businessId: business._id, ownerId: req.userId }),
    ]);

    const filter = { businessId: business._id, ownerId: req.userId };
    if (req.query.status === 'unread') filter.isRead = false;
    if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    const [notifications, unreadCount] = await Promise.all([
      AppNotification.find(filter).sort({ createdAt: -1 }).limit(limit),
      AppNotification.countDocuments({
        businessId: business._id,
        ownerId: req.userId,
        isRead: false,
      }),
    ]);

    return res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ message: 'Unable to load notifications' });
  }
};

const getNotificationSummary = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    await Promise.all([
      syncInventoryNotifications({ businessId: business._id, ownerId: req.userId }),
      syncTaskNotifications({ businessId: business._id, ownerId: req.userId }),
    ]);

    const base = { businessId: business._id, ownerId: req.userId };
    const [unreadCount, criticalUnreadCount, latestUnread] = await Promise.all([
      AppNotification.countDocuments({ ...base, isRead: false }),
      AppNotification.countDocuments({ ...base, isRead: false, severity: 'critical' }),
      AppNotification.findOne({ ...base, isRead: false }).sort({ createdAt: -1 }),
    ]);

    return res.status(200).json({ unreadCount, criticalUnreadCount, latestUnread });
  } catch (error) {
    console.error('Notification summary error:', error);
    return res.status(500).json({ message: 'Unable to load notification summary' });
  }
};

const markAsRead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const notification = await AppNotification.findOneAndUpdate(
      { _id: req.params.id, businessId: business._id, ownerId: req.userId },
      { isRead: true, readAt: new Date() },
      { new: true },
    );

    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    return res.status(200).json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ message: 'Unable to update notification' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const result = await AppNotification.updateMany(
      { businessId: business._id, ownerId: req.userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    return res.status(200).json({
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({ message: 'Unable to update notifications' });
  }
};

const deleteNotification = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const notification = await AppNotification.findOneAndDelete({
      _id: req.params.id,
      businessId: business._id,
      ownerId: req.userId,
    });

    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    return res.status(200).json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    return res.status(500).json({ message: 'Unable to delete notification' });
  }
};

const clearReadNotifications = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const result = await AppNotification.deleteMany({
      businessId: business._id,
      ownerId: req.userId,
      isRead: true,
    });

    return res.status(200).json({
      message: 'Read notifications cleared',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('Clear notifications error:', error);
    return res.status(500).json({ message: 'Unable to clear notifications' });
  }
};

module.exports = {
  clearReadNotifications,
  deleteNotification,
  getNotificationSummary,
  getNotifications,
  markAllAsRead,
  markAsRead,
};
