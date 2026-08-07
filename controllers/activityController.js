const Business = require('../models/Business');
const Activity = require('../models/Activity');

const listActivities = async (req, res) => {
  try {
    const business = await Business.findOne({ ownerId: req.userId }).select('_id');
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });
    const filter = { businessId: business._id, ownerId: req.userId };
    if (['Sales', 'Expenses', 'Customers', 'Inventory', 'Tasks', 'Business'].includes(req.query.category)) {
      filter.category = req.query.category;
    }
    const search = `${req.query.search || ''}`.trim();
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ title: { $regex: safe, $options: 'i' } }, { description: { $regex: safe, $options: 'i' } }];
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && !Number.isNaN(before.getTime())) filter.occurredAt = { $lt: before };
    const activities = await Activity.find(filter).sort({ occurredAt: -1, _id: -1 }).limit(limit + 1).lean();
    const hasMore = activities.length > limit;
    if (hasMore) activities.pop();
    return res.json({ activities, hasMore, nextBefore: hasMore ? activities[activities.length - 1]?.occurredAt : null });
  } catch (error) {
    console.error('List activities error:', error);
    return res.status(500).json({ message: 'Unable to load activities' });
  }
};

module.exports = { listActivities };
