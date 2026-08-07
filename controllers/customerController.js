const mongoose = require('mongoose');
const Business = require('../models/Business');
const Customer = require('../models/Customer');
const { recordActivity } = require('../services/activityService');

const allowedTypes = new Set(['Regular', 'VIP', 'Wholesale']);

const getBusiness = async (userId) => Business.findOne({ ownerId: userId }).select('_id');

const cleanText = (value) => `${value ?? ''}`.trim();

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const customerPayload = (body, current = {}) => {
  const requestedType = cleanText(body.customerType || current.customerType || 'Regular');
  return {
    name: cleanText(body.name),
    phone: cleanText(body.phone).replace(/\s+/g, ''),
    email: cleanText(body.email).toLowerCase(),
    address: cleanText(body.address),
    city: cleanText(body.city),
    customerType: allowedTypes.has(requestedType) ? requestedType : 'Regular',
    notes: cleanText(body.notes),
    creditLimit: numberValue(body.creditLimit, current.creditLimit || 0),
    outstandingBalance: numberValue(
      body.outstandingBalance,
      current.outstandingBalance || 0,
    ),
    isActive: body.isActive === undefined ? current.isActive ?? true : body.isActive === true,
  };
};

const validatePayload = (payload) => {
  if (payload.name.length < 2) return 'Customer name must contain at least 2 characters';
  if (!/^[0-9+()-]{7,20}$/.test(payload.phone)) return 'Enter a valid phone number';
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return 'Enter a valid email address';
  }
  if (payload.creditLimit < 0 || payload.outstandingBalance < 0) {
    return 'Credit values cannot be negative';
  }
  if (payload.creditLimit > 0 && payload.outstandingBalance > payload.creditLimit) {
    return 'Outstanding balance cannot be greater than the credit limit';
  }
  return null;
};

const customerFilter = (businessId, query) => {
  const filter = { businessId };
  const search = cleanText(query.search);
  const type = cleanText(query.type);
  const balance = cleanText(query.balance);

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [
      { name: expression },
      { phone: expression },
      { email: expression },
      { city: expression },
    ];
  }
  if (allowedTypes.has(type)) filter.customerType = type;
  if (balance === 'due') filter.outstandingBalance = { $gt: 0 };
  if (balance === 'clear') filter.outstandingBalance = 0;
  if (query.active === 'true') filter.isActive = true;
  if (query.active === 'false') filter.isActive = false;

  return filter;
};

const listCustomers = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const customers = await Customer.find(customerFilter(business._id, req.query))
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ customers });
  } catch (error) {
    console.error('List customers error:', error);
    return res.status(500).json({ message: 'Unable to load customers' });
  }
};

const getCustomerSummary = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const [summary] = await Customer.aggregate([
      { $match: { businessId: business._id } },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          activeCustomers: { $sum: { $cond: ['$isActive', 1, 0] } },
          customersWithDue: {
            $sum: { $cond: [{ $gt: ['$outstandingBalance', 0] }, 1, 0] },
          },
          totalOutstanding: { $sum: '$outstandingBalance' },
          totalPurchases: { $sum: '$totalPurchases' },
        },
      },
    ]);

    return res.json({
      summary: summary || {
        totalCustomers: 0,
        activeCustomers: 0,
        customersWithDue: 0,
        totalOutstanding: 0,
        totalPurchases: 0,
      },
    });
  } catch (error) {
    console.error('Customer summary error:', error);
    return res.status(500).json({ message: 'Unable to load customer summary' });
  }
};

const createCustomer = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const payload = customerPayload(req.body);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    const existing = await Customer.findOne({
      businessId: business._id,
      phone: payload.phone,
    }).select('_id');
    if (existing) {
      return res.status(409).json({
        message: 'A customer with this phone number already exists',
      });
    }

    const customer = await Customer.create({ businessId: business._id, ...payload });
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'customer_added', category: 'Customers', title: `${customer.name} added as a customer`, description: customer.phone, entityType: 'Customer', entityId: customer._id, route: '/customers' });
    return res.status(201).json({ message: 'Customer added successfully', customer });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'This phone number is already in use' });
    }
    console.error('Create customer error:', error);
    return res.status(500).json({ message: 'Unable to add customer' });
  }
};

const updateCustomer = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const current = await Customer.findOne({
      _id: req.params.id,
      businessId: business._id,
    });
    if (!current) return res.status(404).json({ message: 'Customer not found' });

    const payload = customerPayload(req.body, current);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    const duplicate = await Customer.findOne({
      businessId: business._id,
      phone: payload.phone,
      _id: { $ne: current._id },
    }).select('_id');
    if (duplicate) {
      return res.status(409).json({
        message: 'Another customer already uses this phone number',
      });
    }

    Object.assign(current, payload);
    await current.save();
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'customer_updated', category: 'Customers', title: `${current.name} profile updated`, description: current.phone, entityType: 'Customer', entityId: current._id, route: '/customers' });
    return res.json({ message: 'Customer updated successfully', customer: current });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'This phone number is already in use' });
    }
    console.error('Update customer error:', error);
    return res.status(500).json({ message: 'Unable to update customer' });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const customer = await Customer.findOne({
      _id: req.params.id,
      businessId: business._id,
    });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    if (customer.purchaseCount > 0 || customer.totalPurchases > 0) {
      customer.isActive = false;
      await customer.save();
      return res.json({
        message: 'Customer has purchase history, so the profile was archived instead',
        archived: true,
      });
    }

    await customer.deleteOne();
    return res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete customer error:', error);
    return res.status(500).json({ message: 'Unable to delete customer' });
  }
};

module.exports = {
  listCustomers,
  getCustomerSummary,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
