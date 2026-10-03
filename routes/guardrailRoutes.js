const express = require('express');
const Business = require('../models/Business');

let auth;
try {
  auth = require('../middleware/authMiddleware');
} catch (_) {
  auth = require('../middleware/auth');
}

if (auth && typeof auth !== 'function') {
  auth = auth.authMiddleware || auth.auth || auth.verifyToken || auth;
}

const {
  listGuardrails,
  createGuardrail,
  updateGuardrail,
  deleteGuardrail,
  scan,
  checkSimulation,
} = require('../controllers/guardrailController');

const router = express.Router();

const attachUserAndBusiness = async (req, res, next) => {
  try {
    // authMiddleware already puts the logged-in user here
    if (!req.user?._id) {
      return res.status(401).json({
        message: 'Authenticated user not found',
      });
    }

    // Set the field used by Guardrail controllers/services
    req.userId = req.user._id;

    const business = await Business.findOne({
      ownerId: req.userId,
    }).select('_id').lean();

    if (!business) {
      return res.status(404).json({
        message: 'Business workspace not found',
      });
    }

    req.businessId = business._id;

    next();
  } catch (error) {
    console.error('Guardrail business lookup error:', error);

    return res.status(500).json({
      message: 'Unable to resolve business workspace',
    });
  }
};

router.use(auth, attachUserAndBusiness);

router.get('/', listGuardrails);
router.post('/', createGuardrail);
router.put('/:id', updateGuardrail);
router.delete('/:id', deleteGuardrail);

router.post('/scan', scan);
router.post('/check', checkSimulation);

module.exports = router;