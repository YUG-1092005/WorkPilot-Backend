const mongoose = require('mongoose');
const AppNotification = require('../models/AppNotification');
const Business = require('../models/Business');
const PushDevice = require('../models/PushDevice');
const { syncInventoryNotifications } = require('../services/inventoryNotificationService');

const clean = (value) => `${value ?? ''}`.trim();
const getBusiness = (userId) => Business.findOne({ ownerId: userId }).select('_id');

const getNotifications = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    await syncInventoryNotifications({ businessId: business._id, ownerId: req.userId });
    const filter = { businessId: business._id, ownerId: req.userId };
    if (req.query.status === 'unread') filter.isRead = false;
    if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const [notifications, unreadCount] = await Promise.all([
      AppNotification.find(filter).sort({ createdAt: -1 }).limit(limit),
      AppNotification.countDocuments({ ...filter, isRead: false }),
    ]);
    return res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ message: 'Unable to load notifications' });
  }
};

const getNotificationSummary = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    await syncInventoryNotifications({ businessId: business._id, ownerId: req.userId });
    const base = { businessId: business._id, ownerId: req.userId };
    const [unreadCount, criticalUnreadCount, latestUnread] = await Promise.all([
      AppNotification.countDocuments({ ...base, isRead: false }),
      AppNotification.countDocuments({ ...base, isRead: false, severity: 'critical' }),
      AppNotification.findOne({ ...base, isRead: false }).sort({ createdAt: -1 }),
    ]);
    return res.json({ unreadCount, criticalUnreadCount, latestUnread });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load notification summary' });
  }
};

const registerDevice = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const token = clean(req.body.token);
    const deviceId = clean(req.body.deviceId);
    if (token.length < 20 || token.length > 4096) {
      return res.status(400).json({ message: 'Invalid notification token' });
    }
    if (!deviceId || deviceId.length > 180) {
      return res.status(400).json({ message: 'Invalid device ID' });
    }

    const existing = await PushDevice.findOne({ token }).select('_id ownerId');
    const isNewForOwner = !existing || `${existing.ownerId}` !== `${req.userId}`;
    await PushDevice.findOneAndUpdate(
      { token },
      {
        $set: {
          businessId: business._id,
          ownerId: req.userId,
          deviceId,
          platform: ['android', 'ios'].includes(req.body.platform) ? req.body.platform : 'unknown',
          isActive: true,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (isNewForOwner) {
      await AppNotification.create({
        businessId: business._id,
        ownerId: req.userId,
        type: 'system',
        severity: 'success',
        title: 'WorkPilot notifications are active',
        message: 'Business alerts will now appear in your phone notification panel.',
      });
    }
    return res.json({ message: 'Phone notifications enabled' });
  } catch (error) {
    console.error('Register push device error:', error);
    return res.status(500).json({ message: 'Unable to enable phone notifications' });
  }
};

const unregisterDevice = async (req, res) => {
  try {
    const deviceId = clean(req.body.deviceId);
    const token = clean(req.body.token);
    const selectors = [];
    if (deviceId) selectors.push({ deviceId });
    if (token) selectors.push({ token });
    if (selectors.length > 0) {
      await PushDevice.deleteMany({ ownerId: req.userId, $or: selectors });
    }
    return res.json({ message: 'Phone notifications disabled for this account' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to disable phone notifications' });
  }
};

const markAsRead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification ID' });
    const business = await getBusiness(req.userId);
    const notification = business && await AppNotification.findOneAndUpdate(
      { _id: req.params.id, businessId: business._id, ownerId: req.userId },
      { isRead: true, readAt: new Date() },
      { new: true },
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    return res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
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
    return res.json({ message: 'All notifications marked as read', updatedCount: result.modifiedCount });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update notifications' });
  }
};

const deleteNotification = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification ID' });
    const business = await getBusiness(req.userId);
    const notification = business && await AppNotification.findOneAndDelete({
      _id: req.params.id,
      businessId: business._id,
      ownerId: req.userId,
    });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    return res.json({ message: 'Notification deleted' });
  } catch (error) {
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
    return res.json({ message: 'Read notifications cleared', deletedCount: result.deletedCount });
  } catch (error) {
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
  registerDevice,
  unregisterDevice,
};
