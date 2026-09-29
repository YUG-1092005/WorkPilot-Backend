const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const Business = require('../models/Business');

const getBusiness = async (userId) => Business.findOne({ ownerId: userId });

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const dependencyLevel = (share) => {
  if (share >= 20) return 'Critical';
  if (share >= 10) return 'High';
  if (share >= 5) return 'Moderate';
  return 'Low';
};

const getDependencyMap = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) {
      return res.status(404).json({ message: 'Business workspace not found' });
    }

    const invoiceMatch = {
      businessId: business._id,
      status: 'Active',
    };

    const [
      businessTotals,
      customerAggregates,
      productAggregates,
      edgeAggregates,
      customerCount,
      productCount,
    ] = await Promise.all([
      Invoice.aggregate([
        { $match: invoiceMatch },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$total' },
            invoiceCount: { $sum: 1 },
          },
        },
      ]),
      Invoice.aggregate([
        { $match: invoiceMatch },
        {
          $group: {
            _id: '$customerId',
            name: { $first: '$customerSnapshot.name' },
            phone: { $first: '$customerSnapshot.phone' },
            revenue: { $sum: '$total' },
            outstanding: { $sum: '$balanceDue' },
            invoiceCount: { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 8 },
      ]),
      Invoice.aggregate([
        { $match: invoiceMatch },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            sku: { $first: '$items.sku' },
            revenue: { $sum: '$items.lineTotal' },
            unitsSold: { $sum: '$items.quantity' },
            customerIds: { $addToSet: '$customerId' },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 8 },
      ]),
      Invoice.aggregate([
        { $match: invoiceMatch },
        { $unwind: '$items' },
        {
          $group: {
            _id: {
              customerId: '$customerId',
              productId: '$items.productId',
            },
            revenue: { $sum: '$items.lineTotal' },
            units: { $sum: '$items.quantity' },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 80 },
      ]),
      Customer.countDocuments({ businessId: business._id, isActive: true }),
      Product.countDocuments({ businessId: business._id, isActive: true }),
    ]);

    const totalSales = roundMoney(businessTotals[0]?.totalSales || 0);
    const invoiceCount = Number(businessTotals[0]?.invoiceCount || 0);

    const topProductIds = productAggregates.map((row) => row._id).filter(Boolean);

    const products = topProductIds.length
      ? await Product.find({
          _id: { $in: topProductIds },
          businessId: business._id,
          isActive: true,
        })
          .select('name sku quantity unit sellingPrice')
          .lean()
      : [];

    const productMap = new Map(products.map((product) => [String(product._id), product]));

    const customers = customerAggregates.map((row) => {
      const revenue = roundMoney(row.revenue);
      const share = totalSales > 0 ? roundMoney((revenue / totalSales) * 100) : 0;
      return {
        id: String(row._id),
        type: 'customer',
        name: row.name || 'Customer',
        phone: row.phone || '',
        revenue,
        share,
        invoiceCount: Number(row.invoiceCount || 0),
        outstanding: roundMoney(row.outstanding),
        dependencyLevel: dependencyLevel(share),
      };
    });

    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));

    const productsOut = productAggregates
      .filter((row) => row._id)
      .map((row) => {
        const revenue = roundMoney(row.revenue);
        const share = totalSales > 0 ? roundMoney((revenue / totalSales) * 100) : 0;
        const product = productMap.get(String(row._id));
        return {
          id: String(row._id),
          type: 'product',
          name: row.name || 'Product',
          sku: row.sku || '',
          revenue,
          share,
          unitsSold: Number(row.unitsSold || 0),
          currentStock: Number(product?.quantity || 0),
          unit: product?.unit || 'pcs',
          customerCount: Array.isArray(row.customerIds) ? row.customerIds.length : 0,
          dependencyLevel: dependencyLevel(share),
        };
      });

    const edges = edgeAggregates
      .filter(
        (row) =>
          row._id?.customerId &&
          row._id?.productId &&
          customerMap.has(String(row._id.customerId)) &&
          productsOut.some((product) => product.id === String(row._id.productId)),
      )
      .map((row) => ({
        customerId: String(row._id.customerId),
        productId: String(row._id.productId),
        revenue: roundMoney(row.revenue),
        units: Number(row.units || 0),
      }));

    const topCustomerShare = roundMoney(
      customers.slice(0, 3).reduce((sum, customer) => sum + customer.share, 0),
    );
    const topProductShare = roundMoney(
      productsOut.slice(0, 3).reduce((sum, product) => sum + product.share, 0),
    );

    return res.status(200).json({
      summary: {
        businessName: business.businessName || 'WorkPilot Business',
        totalSales,
        invoiceCount,
        totalCustomers: customerCount,
        totalProducts: productCount,
        topCustomerShare,
        topProductShare,
        hasSales: invoiceCount > 0 && totalSales > 0,
      },
      customers,
      products: productsOut,
      edges,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Dependency map error:', error);
    return res.status(500).json({ message: 'Unable to build business dependency map' });
  }
};

module.exports = { getDependencyMap };
