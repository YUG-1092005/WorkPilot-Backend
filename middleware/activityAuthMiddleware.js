const { protectProfile } = require('./profileAuthMiddleware');
module.exports = { protectActivities: protectProfile };
