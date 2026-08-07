const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protectInventory = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || '';
    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('_id role');

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    req.userId = user._id;
    req.user = user;
    return next();
  } catch (_) {
    return res.status(401).json({ message: 'Session expired. Please login again.' });
  }
};

module.exports = { protectInventory };
