const Guardrail = require('../models/Guardrail');
const {
  buildDescription,
  scanBusiness,
  evaluateSimulation,
} = require('../services/guardrailService');

const listGuardrails = async (req, res) => {
  try {
    const rules = await Guardrail.find({
      ownerId: req.userId,
    }).sort({ createdAt: -1 }).lean();
    return res.json({ rules });
  } catch (error) {
    console.error('List guardrails error:', error);
    return res.status(500).json({ message: 'Unable to load guardrails' });
  }
};

const createGuardrail = async (req, res) => {
  try {
    const { name, description, type, operator, threshold, action } = req.body;
    if (!name || !type || !operator || threshold === undefined) {
      return res.status(400).json({ message: 'Name, type, operator and threshold are required' });
    }

    const rule = await Guardrail.create({
      businessId: req.businessId,
      ownerId: req.userId,
      name: String(name).trim(),
      description: String(description || '').trim(),
      type,
      operator,
      threshold: Number(threshold),
      action: action || 'warn',
      active: true,
    });

    return res.status(201).json({
      message: 'Guardrail created successfully',
      rule: rule.toObject(),
      description: buildDescription(rule),
    });
  } catch (error) {
    console.error('Create guardrail error:', error);
    return res.status(500).json({ message: 'Unable to create guardrail' });
  }
};

const updateGuardrail = async (req, res) => {
  try {
    const update = {};
    for (const key of ['name', 'description', 'type', 'operator', 'threshold', 'action', 'active']) {
      if (req.body[key] !== undefined) update[key] = key === 'threshold' ? Number(req.body[key]) : req.body[key];
    }
    const rule = await Guardrail.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.userId },
      update,
      { new: true, runValidators: true },
    ).lean();

    if (!rule) return res.status(404).json({ message: 'Guardrail not found' });
    return res.json({ message: 'Guardrail updated successfully', rule });
  } catch (error) {
    console.error('Update guardrail error:', error);
    return res.status(500).json({ message: 'Unable to update guardrail' });
  }
};

const deleteGuardrail = async (req, res) => {
  try {
    const deleted = await Guardrail.findOneAndDelete({
      _id: req.params.id,
      ownerId: req.userId,
    });
    if (!deleted) return res.status(404).json({ message: 'Guardrail not found' });
    return res.json({ message: 'Guardrail deleted successfully' });
  } catch (error) {
    console.error('Delete guardrail error:', error);
    return res.status(500).json({ message: 'Unable to delete guardrail' });
  }
};

const scan = async (req, res) => {
  try {
    const result = await scanBusiness({
      userId: req.userId,
      businessId: req.businessId,
      applyActions: req.body?.applyActions !== false,
    });
    return res.json(result);
  } catch (error) {
    console.error('Guardrail scan error:', error);
    return res.status(500).json({ message: 'Unable to scan business rules' });
  }
};

const checkSimulation = async (req, res) => {
  try {
    const { type, value } = req.body;
    if (!type || value === undefined) {
      return res.status(400).json({ message: 'Type and value are required' });
    }
    const result = await evaluateSimulation({
      userId: req.userId,
      businessId: req.businessId,
      type: req.body.type,
      value: req.body.value,
    });
    return res.json(result);
  } catch (error) {
    console.error('Guardrail simulation error:', error);
    return res.status(500).json({ message: 'Unable to evaluate guardrails' });
  }
};

module.exports = {
  listGuardrails,
  createGuardrail,
  updateGuardrail,
  deleteGuardrail,
  scan,
  checkSimulation,
};
