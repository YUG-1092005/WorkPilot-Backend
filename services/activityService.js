const Activity = require('../models/Activity');

const recordActivity = async (payload) => {
  try {
    return await Activity.create(payload);
  } catch (error) {
    console.error('Activity logging error:', error);
    return null;
  }
};

module.exports = { recordActivity };
