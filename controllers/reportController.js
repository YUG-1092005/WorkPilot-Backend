const Business = require('../models/Business');
const Customer = require('../models/Customer');
const Expense = require('../models/Expense');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const Task = require('../models/Task');

const indiaOffset = '+05:30';
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const parseDate = (value, endOfDay = false) => {
  if (!value) return null;
  const match = `${value}`.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = match
    ? new Date(`${match[1]}-${match[2]}-${match[3]}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:30`)
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const defaultRange = () => {
  const now = new Date();
  const indiaNow = new Date(now.getTime() + 330 * 60 * 1000);
  const year = indiaNow.getUTCFullYear();
  const month = indiaNow.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month, 1) - 330 * 60 * 1000),
    to: now,
  };
};

const rangeFrom = (query) => {
  const fallback = defaultRange();
  const from = parseDate(query.from) || fallback.from;
  const to = parseDate(query.to, true) || fallback.to;
  if (from > to) return fallback;
  return { from, to };
};

const groupExpression = (groupBy) => {
  if (groupBy === 'month') {
    return { $dateToString: { format: '%Y-%m', date: '$invoiceDate', timezone: indiaOffset } };
  }
  if (groupBy === 'week') {
    return { $dateToString: { format: '%G-W%V', date: '$invoiceDate', timezone: indiaOffset } };
  }
  return { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate', timezone: indiaOffset } };
};

const getReport = async (req, res) => {
  try {
    const business = await Business.findOne({ ownerId: req.userId })
      .select('_id ownerId businessName businessType phone')
      .lean();
    if (!business) return res.status(404).json({ message: 'Business workspace not found' });

    const { from, to } = rangeFrom(req.query);
    const groupBy = ['day', 'week', 'month'].includes(req.query.groupBy)
      ? req.query.groupBy
      : 'day';
    const invoiceMatch = {
      businessId: business._id,
      status: 'Active',
      invoiceDate: { $gte: from, $lte: to },
    };
    const expenseMatch = {
      businessId: business._id,
      ownerId: req.userId,
      expenseDate: { $gte: from, $lte: to },
    };
    const taskMatch = {
      businessId: business._id,
      ownerId: req.userId,
      createdAt: { $lte: to },
      $or: [{ completedAt: { $gte: from } }, { status: 'Pending' }, { createdAt: { $gte: from } }],
    };

    const [
      invoiceTotalsRows,
      salesTrendRows,
      paymentRows,
      productRows,
      customerRows,
      expenseTotalsRows,
      expenseRows,
      taskRows,
      inventoryRows,
      customerCount,
      invoiceDetails,
      expenseDetails,
    ] = await Promise.all([
      Invoice.aggregate([
        { $match: invoiceMatch },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$total' },
            grossProfit: { $sum: '$grossProfit' },
            paid: { $sum: '$paidAmount' },
            outstanding: { $sum: '$balanceDue' },
            invoiceCount: { $sum: 1 },
          },
        },
      ]),
      Invoice.aggregate([
        { $match: invoiceMatch },
        {
          $group: {
            _id: groupExpression(groupBy),
            revenue: { $sum: '$total' },
            grossProfit: { $sum: '$grossProfit' },
            invoices: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Invoice.aggregate([
        { $match: invoiceMatch },
        {
          $group: {
            _id: '$paymentStatus',
            amount: { $sum: '$total' },
            paid: { $sum: '$paidAmount' },
            outstanding: { $sum: '$balanceDue' },
            count: { $sum: 1 },
          },
        },
        { $sort: { amount: -1 } },
      ]),
      Invoice.aggregate([
        { $match: invoiceMatch },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            sku: { $first: '$items.sku' },
            unit: { $first: '$items.unit' },
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.lineTotal' },
            cost: {
              $sum: { $multiply: ['$items.costPrice', '$items.quantity'] },
            },
          },
        },
        { $addFields: { grossProfit: { $subtract: ['$revenue', '$cost'] } } },
        { $sort: { revenue: -1 } },
        { $limit: 20 },
      ]),
      Invoice.aggregate([
        { $match: invoiceMatch },
        {
          $group: {
            _id: '$customerId',
            name: { $first: '$customerSnapshot.name' },
            phone: { $first: '$customerSnapshot.phone' },
            purchases: { $sum: '$total' },
            paid: { $sum: '$paidAmount' },
            outstanding: { $sum: '$balanceDue' },
            invoiceCount: { $sum: 1 },
          },
        },
        { $sort: { purchases: -1 } },
        { $limit: 20 },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: null, expenses: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: '$category', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { amount: -1 } },
      ]),
      Task.aggregate([
        { $match: taskMatch },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            overdue: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$status', 'Pending'] }, { $lt: ['$dueAt', new Date()] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Product.aggregate([
        { $match: { businessId: business._id, ownerId: req.userId, isActive: true } },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            inventoryCostValue: { $sum: { $multiply: ['$quantity', '$costPrice'] } },
            inventoryRetailValue: { $sum: { $multiply: ['$quantity', '$sellingPrice'] } },
            lowStock: {
              $sum: {
                $cond: [
                  { $and: [{ $gt: ['$quantity', 0] }, { $lte: ['$quantity', '$lowStockThreshold'] }] },
                  1,
                  0,
                ],
              },
            },
            outOfStock: { $sum: { $cond: [{ $lte: ['$quantity', 0] }, 1, 0] } },
          },
        },
      ]),
      Customer.countDocuments({ businessId: business._id, isActive: true }),
      Invoice.find(invoiceMatch)
        .select('invoiceNumber invoiceDate customerSnapshot total grossProfit paidAmount balanceDue paymentStatus paymentMethod')
        .sort({ invoiceDate: -1 })
        .limit(2000)
        .lean(),
      Expense.find(expenseMatch)
        .select('title category amount expenseDate paymentMethod vendor isRecurring')
        .sort({ expenseDate: -1 })
        .limit(2000)
        .lean(),
    ]);

    const invoiceTotals = invoiceTotalsRows[0] || {};
    const expenseTotals = expenseTotalsRows[0] || {};
    const inventory = inventoryRows[0] || {};
    const revenue = roundMoney(invoiceTotals.revenue);
    const grossProfit = roundMoney(invoiceTotals.grossProfit);
    const expenses = roundMoney(expenseTotals.expenses);
    const netProfit = roundMoney(grossProfit - expenses);
    const invoiceCount = Number(invoiceTotals.invoiceCount || 0);
    const taskCounts = { completed: 0, pending: 0, overdue: 0 };
    for (const row of taskRows) {
      if (row._id === 'Completed') taskCounts.completed = row.count;
      if (row._id === 'Pending') {
        taskCounts.pending = row.count;
        taskCounts.overdue = row.overdue;
      }
    }
    const taskTotal = taskCounts.completed + taskCounts.pending;

    return res.json({
      period: { from, to, groupBy },
      business: {
        name: business.businessName || 'WorkPilot Business',
        type: business.businessType || '',
        phone: business.phone || '',
      },
      overview: {
        revenue,
        grossProfit,
        expenses,
        netProfit,
        profitMargin: revenue > 0 ? roundMoney((netProfit / revenue) * 100) : 0,
        grossMargin: revenue > 0 ? roundMoney((grossProfit / revenue) * 100) : 0,
        paid: roundMoney(invoiceTotals.paid),
        outstanding: roundMoney(invoiceTotals.outstanding),
        invoiceCount,
        averageOrderValue: invoiceCount > 0 ? roundMoney(revenue / invoiceCount) : 0,
        expenseCount: Number(expenseTotals.count || 0),
        customerCount,
      },
      salesTrend: salesTrendRows.map((row) => ({
        label: row._id,
        revenue: roundMoney(row.revenue),
        grossProfit: roundMoney(row.grossProfit),
        invoices: row.invoices,
      })),
      payments: paymentRows.map((row) => ({
        status: row._id,
        amount: roundMoney(row.amount),
        paid: roundMoney(row.paid),
        outstanding: roundMoney(row.outstanding),
        count: row.count,
      })),
      products: productRows.map((row) => ({
        productId: row._id,
        name: row.name,
        sku: row.sku,
        unit: row.unit,
        quantity: row.quantity,
        revenue: roundMoney(row.revenue),
        grossProfit: roundMoney(row.grossProfit),
      })),
      inventory: {
        totalProducts: Number(inventory.totalProducts || 0),
        lowStock: Number(inventory.lowStock || 0),
        outOfStock: Number(inventory.outOfStock || 0),
        costValue: roundMoney(inventory.inventoryCostValue),
        retailValue: roundMoney(inventory.inventoryRetailValue),
      },
      customers: customerRows.map((row) => ({
        customerId: row._id,
        name: row.name,
        phone: row.phone,
        purchases: roundMoney(row.purchases),
        paid: roundMoney(row.paid),
        outstanding: roundMoney(row.outstanding),
        invoiceCount: row.invoiceCount,
      })),
      expenseCategories: expenseRows.map((row) => ({
        category: row._id,
        amount: roundMoney(row.amount),
        count: row.count,
      })),
      tasks: {
        ...taskCounts,
        total: taskTotal,
        completionRate: taskTotal > 0
          ? roundMoney((taskCounts.completed / taskTotal) * 100)
          : 0,
      },
      details: {
        invoices: invoiceDetails,
        expenses: expenseDetails,
      },
    });
  } catch (error) {
    console.error('Report generation error:', error);
    return res.status(500).json({ message: 'Unable to generate report' });
  }
};

module.exports = { getReport };
