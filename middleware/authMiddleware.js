const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const token = authorization.split(' ')[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
    );

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        message: 'User account not found',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      message: 'Your session is invalid or has expired',
    });
  }
};

module.exports = protect;