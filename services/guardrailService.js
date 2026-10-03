const Guardrail = require('../models/Guardrail');
const Business = require('../models/Business');
const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Task = require('../models/Task');

const operatorMatches = (value, operator, threshold) => {
  const v = Number(value);
  const t = Number(threshold);
  if (!Number.isFinite(v) || !Number.isFinite(t)) return false;
  switch (operator) {
    case 'gt': return v > t;
    case 'gte': return v >= t;
    case 'lt': return v < t;
    case 'lte': return v <= t;
    default: return false;
  }
};

const typeLabel = {
  invoice_discount_percent: 'Invoice discount',
  invoice_balance_due: 'Invoice balance due',
  expense_amount: 'Expense amount',
  stock_quantity: 'Product stock',
  customer_outstanding: 'Customer outstanding',
};

const operatorLabel = {
  gt: 'greater than',
  gte: 'greater than or equal to',
  lt: 'less than',
  lte: 'less than or equal to',
};

const buildDescription = (rule) =>
  rule.description ||
  `${typeLabel[rule.type] || rule.type} ${operatorLabel[rule.operator]} ${rule.threshold}`;

const getBusiness = async ({ userId, businessId }) => {
  if (businessId) {
    const business = await Business.findById(businessId);
    if (business) return business;
  }

  return Business.findOne({ ownerId: userId });
};

async function evaluateRule(rule, businessId) {
  const triggers = [];
  const base = {
    ruleId: String(rule._id),
    ruleName: rule.name,
    ruleType: rule.type,
    action: rule.action,
    threshold: rule.threshold,
    description: buildDescription(rule),
  };

  if (rule.type === 'invoice_discount_percent' || rule.type === 'invoice_balance_due') {
    const invoices = await Invoice.find({
      businessId,
      status: 'Active',
    })
      .sort({ invoiceDate: -1, createdAt: -1 })
      .limit(100)
      .lean();

    for (const invoice of invoices) {
      const subtotal = Number(invoice.subtotal || 0);
      const discountAmount = Number(invoice.discountAmount || 0);
      const discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
      const value =
        rule.type === 'invoice_discount_percent'
          ? discountPercent
          : Number(invoice.balanceDue || 0);

      if (!operatorMatches(value, rule.operator, rule.threshold)) continue;

      triggers.push({
        ...base,
        entityType: 'Invoice',
        entityId: String(invoice._id),
        entityName: invoice.invoiceNumber || 'Invoice',
        currentValue: Number(value.toFixed(2)),
        message:
          rule.type === 'invoice_discount_percent'
            ? `${invoice.invoiceNumber || 'Invoice'} has a ${Number(value.toFixed(2))}% discount.`
            : `${invoice.invoiceNumber || 'Invoice'} has ${Number(value.toFixed(2))} outstanding.`,
      });
    }
  }

  if (rule.type === 'expense_amount') {
    const expenses = await Expense.find({
      businessId,
      ownerId: rule.ownerId,
    })
      .sort({ expenseDate: -1, createdAt: -1 })
      .limit(100)
      .lean();

    for (const expense of expenses) {
      const value = Number(expense.amount || 0);
      if (!operatorMatches(value, rule.operator, rule.threshold)) continue;
      triggers.push({
        ...base,
        entityType: 'Expense',
        entityId: String(expense._id),
        entityName: expense.title || 'Expense',
        currentValue: Number(value.toFixed(2)),
        message: `${expense.title || 'Expense'} is ${Number(value.toFixed(2))}.`,
      });
    }
  }

  if (rule.type === 'stock_quantity') {
    const products = await Product.find({
      businessId,
      isActive: true,
    })
      .sort({ quantity: 1 })
      .limit(250)
      .lean();

    for (const product of products) {
      const value = Number(product.quantity || 0);
      if (!operatorMatches(value, rule.operator, rule.threshold)) continue;
      triggers.push({
        ...base,
        entityType: 'Product',
        entityId: String(product._id),
        entityName: product.name || 'Product',
        currentValue: Number(value.toFixed(2)),
        message: `${product.name || 'Product'} has ${value} ${product.unit || 'units'} left.`,
      });
    }
  }

  if (rule.type === 'customer_outstanding') {
    const customers = await Customer.find({
      businessId,
      isActive: true,
    })
      .sort({ outstandingBalance: -1 })
      .limit(250)
      .lean();

    for (const customer of customers) {
      const value = Number(customer.outstandingBalance || 0);
      if (!operatorMatches(value, rule.operator, rule.threshold)) continue;
      triggers.push({
        ...base,
        entityType: 'Customer',
        entityId: String(customer._id),
        entityName: customer.name || 'Customer',
        currentValue: Number(value.toFixed(2)),
        message: `${customer.name || 'Customer'} has ${Number(value.toFixed(2))} outstanding.`,
      });
    }
  }

  return triggers;
}

async function scanBusiness({
  userId,
  businessId,
  applyActions = false,
}) {
  const business = await getBusiness({ userId, businessId });  if (!business) throw new Error('Business workspace not found');

  const rules = await Guardrail.find({
    businessId: business._id,
    ownerId: userId,
    active: true,
  }).sort({ createdAt: -1 });

  const allTriggers = [];
  for (const rule of rules) {
    const triggers = await evaluateRule(rule, business._id);
    allTriggers.push(...triggers);
  }

  if (applyActions) {
    for (const trigger of allTriggers.filter((item) => item.action === 'create_task')) {
      const recentTask = await Task.findOne({
        ownerId: userId,
        businessId: business._id,
        title: `Guardrail: ${trigger.ruleName}`,
        description: trigger.message,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (!recentTask) {
        await Task.create({
          businessId: business._id,
          ownerId: userId,
          title: `Guardrail: ${trigger.ruleName}`,
          description: trigger.message,
          category: 'General',
          priority: 'High',
          status: 'Pending',
          dueAt: new Date(Date.now() + 60 * 60 * 1000),
          reminderMinutes: 30,
          reminderAt: new Date(Date.now() + 30 * 60 * 1000),
          customerId: trigger.entityType === 'Customer' ? trigger.entityId : null,
          invoiceId: trigger.entityType === 'Invoice' ? trigger.entityId : null,
          productId: trigger.entityType === 'Product' ? trigger.entityId : null,
          isRecurring: false,
          recurrenceFrequency: 'None',
        });
      }
    }
  }

  return {
    rules: rules.map((rule) => rule.toObject()),
    triggers: allTriggers,
    triggerCount: allTriggers.length,
  };
}

async function evaluateSimulation({ userId, businessId, type, value }) {
  const business = await getBusiness(userId, businessId);
  if (!business) throw new Error('Business workspace not found');

  const rules = await Guardrail.find({
    businessId: business._id,
    ownerId: userId,
    active: true,
    type,
  }).sort({ createdAt: -1 });

  const matched = rules
    .filter((rule) => operatorMatches(value, rule.operator, rule.threshold))
    .map((rule) => ({
      ruleId: String(rule._id),
      ruleName: rule.name,
      action: rule.action,
      threshold: rule.threshold,
      message: `Rule triggered: ${rule.name}`,
      wouldBlock: rule.action === 'block',
    }));

  return {
    value: Number(value),
    matched,
    blocked: matched.some((item) => item.wouldBlock),
  };
}

module.exports = {
  getBusiness,
  buildDescription,
  operatorMatches,
  scanBusiness,
  evaluateSimulation,
};
