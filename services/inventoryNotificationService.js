const AppNotification = require('../models/AppNotification');
const Product = require('../models/Product');

const stockState = (product) => {
  if (Number(product.quantity) === 0) return 'out';
  if (Number(product.quantity) <= Number(product.lowStockThreshold)) return 'low';
  return 'healthy';
};

const buildNotification = (product, state) => {
  const common = {
    businessId: product.businessId,
    ownerId: product.ownerId,
    productId: product._id,
    metadata: {
      productName: product.name,
      sku: product.sku,
      quantity: product.quantity,
      threshold: product.lowStockThreshold,
    },
  };

  if (state === 'out') {
    return {
      ...common,
      type: 'inventory_out',
      severity: 'critical',
      title: 'Product out of stock',
      message: `${product.name} (${product.sku}) is out of stock. Restock it now to avoid missed sales.`,
    };
  }

  if (state === 'low') {
    return {
      ...common,
      type: 'inventory_low',
      severity: 'warning',
      title: 'Low-stock warning',
      message: `${product.name} has only ${product.quantity} ${product.unit} left. Its alert level is ${product.lowStockThreshold}.`,
    };
  }

  return {
    ...common,
    type: 'inventory_restocked',
    severity: 'success',
    title: 'Stock level restored',
    message: `${product.name} is back above its low-stock level with ${product.quantity} ${product.unit} available.`,
  };
};

const notifyForStockTransition = async ({ product, previousState = null }) => {
  const currentState = stockState(product);
  const storedState = product.stockAlertState || 'healthy';

  // A newly created healthy product does not need an alert. A genuinely
  // unchanged and already-recorded state also does not create duplicates.
  if (
    (previousState === null && currentState === 'healthy') ||
    (previousState === currentState && storedState === currentState)
  ) {
    if (storedState !== currentState) {
      await Product.updateOne(
        { _id: product._id },
        { $set: { stockAlertState: currentState } },
      );
      product.stockAlertState = currentState;
    }
    return null;
  }

  // Claim this stock-state transition atomically. This prevents Dashboard and
  // Notifications polling at the same moment from creating duplicate alerts.
  const stateCondition = storedState === 'healthy'
    ? { $or: [{ stockAlertState: 'healthy' }, { stockAlertState: { $exists: false } }] }
    : { stockAlertState: storedState };
  const claim = await Product.updateOne(
    { _id: product._id, ...stateCondition },
    { $set: { stockAlertState: currentState } },
  );

  if (claim.modifiedCount === 0) return null;

  try {
    const notification = await AppNotification.create(
      buildNotification(product, currentState),
    );
    product.stockAlertState = currentState;
    return notification;
  } catch (error) {
    await Product.updateOne(
      { _id: product._id, stockAlertState: currentState },
      { $set: { stockAlertState: storedState } },
    );
    throw error;
  }
};

const syncInventoryNotifications = async ({ businessId, ownerId }) => {
  const products = await Product.find({
    businessId,
    ownerId,
    isActive: true,
    $expr: {
      $ne: [
        { $ifNull: ['$stockAlertState', 'healthy'] },
        {
          $switch: {
            branches: [
              { case: { $eq: ['$quantity', 0] }, then: 'out' },
              {
                case: { $lte: ['$quantity', '$lowStockThreshold'] },
                then: 'low',
              },
            ],
            default: 'healthy',
          },
        },
      ],
    },
  });

  for (const product of products) {
    const currentState = stockState(product);
    const storedState = product.stockAlertState || 'healthy';
    if (currentState !== storedState) {
      await notifyForStockTransition({ product, previousState: storedState });
    }
  }
};

module.exports = {
  notifyForStockTransition,
  stockState,
  syncInventoryNotifications,
};
