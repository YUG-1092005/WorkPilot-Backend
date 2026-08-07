const mongoose = require('mongoose');
const Business = require('../models/Business');
const Product = require('../models/Product');
const {
  notifyForStockTransition,
  stockState,
} = require('../services/inventoryNotificationService');
const { recordActivity } = require('../services/activityService');

const getBusiness = async (userId) => Business.findOne({ ownerId: userId });

const notifySafely = async (options) => {
  try {
    return await notifyForStockTransition(options);
  } catch (error) {
    // Inventory changes must remain successful even if notification creation
    // temporarily fails. The failure is still logged for backend diagnosis.
    console.error('Inventory notification error:', error);
    return null;
  }
};

const parseNonNegativeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const productPayload = (body) => ({
  name: body.name?.trim(),
  sku: body.sku?.trim().toUpperCase(),
  category: body.category?.trim() || 'General',
  description: body.description?.trim() || '',
  costPrice: parseNonNegativeNumber(body.costPrice),
  sellingPrice: parseNonNegativeNumber(body.sellingPrice),
  quantity: parseNonNegativeNumber(body.quantity),
  lowStockThreshold: parseNonNegativeNumber(body.lowStockThreshold),
  unit: body.unit?.trim() || 'pcs',
});

const validatePayload = (payload) => {
  if (!payload.name || !payload.sku) return 'Product name and SKU are required';
  if (payload.costPrice === null || payload.sellingPrice === null) {
    return 'Cost price and selling price must be valid non-negative numbers';
  }
  if (payload.quantity === null || !Number.isInteger(payload.quantity)) {
    return 'Quantity must be a non-negative whole number';
  }
  if (
    payload.lowStockThreshold === null ||
    !Number.isInteger(payload.lowStockThreshold)
  ) {
    return 'Low-stock threshold must be a non-negative whole number';
  }
  return null;
};

const createProduct = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const payload = productPayload(req.body);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    const product = await Product.create({
      ...payload,
      businessId: business._id,
      ownerId: req.userId,
    });

    const notification = await notifySafely({ product, previousState: null });
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'product_added', category: 'Inventory', title: `${product.name} added to inventory`, description: `${product.quantity} ${product.unit} • SKU ${product.sku}`, entityType: 'Product', entityId: product._id, route: '/inventory' });
    if (notification) await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'low_stock_warning', category: 'Inventory', title: `Low-stock alert for ${product.name}`, description: `${product.quantity} ${product.unit} remaining`, entityType: 'Product', entityId: product._id, route: '/inventory' });

    return res.status(201).json({
      message: 'Product added successfully',
      product,
      notificationCreated: Boolean(notification),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A product with this SKU already exists' });
    }
    console.error('Create product error:', error);
    return res.status(500).json({ message: 'Unable to add product' });
  }
};

const getProducts = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const filter = { businessId: business._id, isActive: true };
    const search = req.query.search?.trim();
    const category = req.query.category?.trim();
    const stock = req.query.stock?.trim();

    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { sku: { $regex: safeSearch, $options: 'i' } },
        { category: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    if (category && category !== 'All') filter.category = category;
    if (stock === 'out') filter.quantity = 0;
    if (stock === 'available') filter.quantity = { $gt: 0 };
    if (stock === 'low') {
      filter.$expr = {
        $and: [
          { $gt: ['$quantity', 0] },
          { $lte: ['$quantity', '$lowStockThreshold'] },
        ],
      };
    }

    const products = await Product.find(filter).sort({ updatedAt: -1 });
    return res.status(200).json({ products, count: products.length });
  } catch (error) {
    console.error('Get products error:', error);
    return res.status(500).json({ message: 'Unable to load inventory' });
  }
};

const getInventorySummary = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const [summary] = await Product.aggregate([
      { $match: { businessId: business._id, isActive: true } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalUnits: { $sum: '$quantity' },
          inventoryCostValue: { $sum: { $multiply: ['$costPrice', '$quantity'] } },
          inventoryRetailValue: { $sum: { $multiply: ['$sellingPrice', '$quantity'] } },
          lowStockProducts: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ['$quantity', 0] },
                    { $lte: ['$quantity', '$lowStockThreshold'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          outOfStockProducts: { $sum: { $cond: [{ $eq: ['$quantity', 0] }, 1, 0] } },
        },
      },
    ]);

    const lowStockItems = await Product.find({
      businessId: business._id,
      isActive: true,
      $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
    })
      .sort({ quantity: 1, updatedAt: -1 })
      .limit(5);

    return res.status(200).json({
      summary: summary || {
        totalProducts: 0,
        totalUnits: 0,
        inventoryCostValue: 0,
        inventoryRetailValue: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
      },
      lowStockItems,
    });
  } catch (error) {
    console.error('Inventory summary error:', error);
    return res.status(500).json({ message: 'Unable to load inventory summary' });
  }
};

const updateProduct = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const payload = productPayload(req.body);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    const product = await Product.findOne({
      _id: req.params.id,
      businessId: business._id,
      isActive: true,
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const previousState = stockState(product);
    Object.assign(product, payload);
    await product.save();
    const notification = await notifySafely({ product, previousState });
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'product_updated', category: 'Inventory', title: `${product.name} updated`, description: `Stock: ${product.quantity} ${product.unit}`, entityType: 'Product', entityId: product._id, route: '/inventory' });
    if (notification) await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'low_stock_warning', category: 'Inventory', title: `Low-stock alert for ${product.name}`, description: `${product.quantity} ${product.unit} remaining`, entityType: 'Product', entityId: product._id, route: '/inventory' });

    return res.status(200).json({
      message: 'Product updated successfully',
      product,
      notificationCreated: Boolean(notification),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A product with this SKU already exists' });
    }
    console.error('Update product error:', error);
    return res.status(500).json({ message: 'Unable to update product' });
  }
};

const adjustStock = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const change = Number(req.body.change);
    if (!Number.isInteger(change) || change === 0) {
      return res.status(400).json({ message: 'Stock change must be a non-zero whole number' });
    }

    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const product = await Product.findOne({
      _id: req.params.id,
      businessId: business._id,
      isActive: true,
    });

    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.quantity + change < 0) {
      return res.status(400).json({ message: 'Stock cannot become negative' });
    }

    const previousState = stockState(product);
    product.quantity += change;
    await product.save();
    const notification = await notifySafely({ product, previousState });
    await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'stock_adjusted', category: 'Inventory', title: `Stock updated for ${product.name}`, description: `${change > 0 ? '+' : ''}${change} ${product.unit} • New stock: ${product.quantity}`, entityType: 'Product', entityId: product._id, route: '/inventory', metadata: { change, quantity: product.quantity } });
    if (notification) await recordActivity({ businessId: business._id, ownerId: req.userId, type: 'low_stock_warning', category: 'Inventory', title: `Low-stock alert for ${product.name}`, description: `${product.quantity} ${product.unit} remaining`, entityType: 'Product', entityId: product._id, route: '/inventory' });

    return res.status(200).json({
      message: 'Stock updated successfully',
      product,
      notificationCreated: Boolean(notification),
    });
  } catch (error) {
    console.error('Adjust stock error:', error);
    return res.status(500).json({ message: 'Unable to update stock' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      businessId: business._id,
    });

    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    return res.status(500).json({ message: 'Unable to delete product' });
  }
};

module.exports = {
  adjustStock,
  createProduct,
  deleteProduct,
  getInventorySummary,
  getProducts,
  updateProduct,
};
