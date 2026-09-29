//const Product = require('../models/Product');
//const Customer = require('../models/Customer');
//const Invoice = require('../models/Invoice');
//const Task = require('../models/Task');
//const Business = require('../models/Business');
//
//const getBusiness = async (userId) => {
//  return Business.findOne({ ownerId: userId });
//};
//
///*
// * ---------------------------------------------------------
// * TOOL 1: GET INVENTORY
// * ---------------------------------------------------------
// */
//
//const getInventory = async ({ userId, search, stockStatus }) => {
//  const business = await getBusiness(userId);
//
//  if (!business) {
//    throw new Error('Business workspace not found');
//  }
//
//  const filter = {
//    businessId: business._id,
//    isActive: true,
//  };
//
//  if (search) {
//    filter.$or = [
//      { name: { $regex: search, $options: 'i' } },
//      { sku: { $regex: search, $options: 'i' } },
//      { category: { $regex: search, $options: 'i' } },
//    ];
//  }
//
//  if (stockStatus === 'out') {
//    filter.quantity = 0;
//  }
//
//  if (stockStatus === 'low') {
//    filter.$expr = {
//      $and: [
//        { $gt: ['$quantity', 0] },
//        { $lte: ['$quantity', '$lowStockThreshold'] },
//      ],
//    };
//  }
//
//  const products = await Product.find(filter)
//    .select(
//      'name sku category quantity unit costPrice sellingPrice lowStockThreshold'
//    )
//    .sort({ quantity: 1 })
//    .limit(50)
//    .lean();
//
//  return {
//    count: products.length,
//    products,
//  };
//};
//
//
///*
// * ---------------------------------------------------------
// * TOOL 2: GET PENDING PAYMENTS
// * ---------------------------------------------------------
// */
//
//const getPendingPayments = async ({ userId }) => {
//  const business = await getBusiness(userId);
//
//  if (!business) {
//    throw new Error('Business workspace not found');
//  }
//
//  const invoices = await Invoice.find({
//    businessId: business._id,
//    status: 'Active',
//    paymentStatus: { $in: ['Pending', 'Partial'] },
//    balanceDue: { $gt: 0 },
//  })
//    .select(
//      'invoiceNumber customerId customerSnapshot total paidAmount balanceDue paymentStatus dueDate invoiceDate'
//    )
//    .sort({ dueDate: 1 })
//    .limit(100)
//    .lean();
//
//  const totalOutstanding = invoices.reduce(
//    (sum, invoice) => sum + Number(invoice.balanceDue || 0),
//    0
//  );
//
//  return {
//    count: invoices.length,
//    totalOutstanding,
//    invoices,
//  };
//};
//
//
///*
// * ---------------------------------------------------------
// * TOOL 3: GET CUSTOMERS
// * ---------------------------------------------------------
// */
//
//const getCustomers = async ({ userId, search }) => {
//  const business = await getBusiness(userId);
//
//  if (!business) {
//    throw new Error('Business workspace not found');
//  }
//
//  const filter = {
//    businessId: business._id,
//    isActive: true,
//  };
//
//  if (search) {
//    filter.$or = [
//      { name: { $regex: search, $options: 'i' } },
//      { phone: { $regex: search, $options: 'i' } },
//      { email: { $regex: search, $options: 'i' } },
//    ];
//  }
//
//  const customers = await Customer.find(filter)
//    .select(
//      'name phone email customerType outstandingBalance totalPurchases purchaseCount'
//    )
//    .sort({ name: 1 })
//    .limit(50)
//    .lean();
//
//  return {
//    count: customers.length,
//    customers,
//  };
//};
//
//
///*
// * ---------------------------------------------------------
// * TOOL 4: GET TASKS
// * ---------------------------------------------------------
// */
//
//const getTasks = async ({ userId, status }) => {
//  const business = await getBusiness(userId);
//
//  if (!business) {
//    throw new Error('Business workspace not found');
//  }
//
//  const filter = {
//    businessId: business._id,
//    ownerId: userId,
//  };
//
//  if (status) {
//    filter.status = status;
//  }
//
//  const tasks = await Task.find(filter)
//    .select(
//      'title description category priority status dueAt customerId invoiceId productId'
//    )
//    .sort({ dueAt: 1 })
//    .limit(50)
//    .lean();
//
//  return {
//    count: tasks.length,
//    tasks,
//  };
//};
//
//
///*
// * ---------------------------------------------------------
// * TOOL DEFINITIONS FOR GEMINI
// * ---------------------------------------------------------
// */
//
//const geminiTools = [
//  {
//    functionDeclarations: [
//      {
//        name: 'get_inventory',
//        description:
//          'Get WorkPilot inventory products. Use this for questions about stock, products, categories, prices, low-stock products, or out-of-stock products.',
//        parameters: {
//          type: 'OBJECT',
//          properties: {
//            search: {
//              type: 'STRING',
//              description:
//                'Optional product name, SKU, or category to search for.',
//            },
//            stockStatus: {
//              type: 'STRING',
//              enum: ['all', 'low', 'out'],
//              description:
//                'Use low for low-stock products, out for out-of-stock products, and all otherwise.',
//            },
//          },
//        },
//      },
//
//      {
//        name: 'get_pending_payments',
//        description:
//          'Get invoices that have pending or partially paid balances for the current WorkPilot business.',
//        parameters: {
//          type: 'OBJECT',
//          properties: {},
//        },
//      },
//
//      {
//        name: 'get_customers',
//        description:
//          'Find WorkPilot customers by name, phone, or email.',
//        parameters: {
//          type: 'OBJECT',
//          properties: {
//            search: {
//              type: 'STRING',
//              description:
//                'Customer name, phone number, or email.',
//            },
//          },
//        },
//      },
//
//      {
//        name: 'get_tasks',
//        description:
//          'Get WorkPilot tasks, including pending, completed, overdue, and upcoming tasks.',
//        parameters: {
//          type: 'OBJECT',
//          properties: {
//            status: {
//              type: 'STRING',
//              enum: ['Pending', 'Completed'],
//              description: 'Optional task status filter.',
//            },
//          },
//        },
//      },
//    ],
//  },
//];
//
//module.exports = {
//  geminiTools,
//  getInventory,
//  getPendingPayments,
//  getCustomers,
//  getTasks,
//};

const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const Task = require('../models/Task');
const Expense = require('../models/Expense');
const Business = require('../models/Business');

const InvoiceCounter = require('../models/InvoiceCounter');

const {
  notifyForStockTransition,
  stockState,
} = require('../services/inventoryNotificationService');

const { recordActivity } = require('../services/activityService');

const getBusiness = async (userId) => {
  return Business.findOne({ ownerId: userId });
};


/*
 * =========================================================
 * READ TOOLS
 * =========================================================
 */

/*
 * TOOL 1: GET INVENTORY
 */

const getInventory = async ({ userId, search, stockStatus }) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  const filter = {
    businessId: business._id,
    isActive: true,
  };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
    ];
  }

  if (stockStatus === 'out') {
    filter.quantity = 0;
  }

  if (stockStatus === 'low') {
    filter.$expr = {
      $and: [
        { $gt: ['$quantity', 0] },
        { $lte: ['$quantity', '$lowStockThreshold'] },
      ],
    };
  }

  const products = await Product.find(filter)
    .select(
      'name sku category quantity unit costPrice sellingPrice lowStockThreshold'
    )
    .sort({ quantity: 1 })
    .limit(50)
    .lean();

  return {
    count: products.length,
    products,
  };
};


/*
 * TOOL 2: GET PENDING PAYMENTS
 */

const getPendingPayments = async ({ userId }) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  const invoices = await Invoice.find({
    businessId: business._id,
    status: 'Active',
    paymentStatus: { $in: ['Pending', 'Partial'] },
    balanceDue: { $gt: 0 },
  })
    .select(
      'invoiceNumber customerId customerSnapshot total paidAmount balanceDue paymentStatus dueDate invoiceDate'
    )
    .sort({ dueDate: 1 })
    .limit(100)
    .lean();

  const totalOutstanding = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.balanceDue || 0),
    0
  );

  return {
    count: invoices.length,
    totalOutstanding,
    invoices,
  };
};


/*
 * TOOL 3: GET CUSTOMERS
 */

const getCustomers = async ({ userId, search }) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  const filter = {
    businessId: business._id,
    isActive: true,
  };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const customers = await Customer.find(filter)
    .select(
      'name phone email customerType outstandingBalance totalPurchases purchaseCount'
    )
    .sort({ name: 1 })
    .limit(50)
    .lean();

  return {
    count: customers.length,
    customers,
  };
};


const callCustomer = async ({
  userId,
  customerName,
}) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  if (!customerName) {
    throw new Error('Customer name is required');
  }

  const customers = await Customer.find({
    businessId: business._id,
    isActive: true,
    name: {
      $regex: customerName.trim(),
      $options: 'i',
    },
  })
    .limit(10)
    .lean();

  if (customers.length === 0) {
    throw new Error(
      `Customer "${customerName}" was not found`
    );
  }

  if (customers.length > 1) {
    throw new Error(
      `Multiple customers found with name "${customerName}". Please provide a more specific name.`
    );
  }

  const customer = customers[0];

  if (!customer.phone) {
    throw new Error(
      `Customer "${customer.name}" does not have a phone number`
    );
  }

  return {
    success: true,
    action: 'call_customer',
    customer: {
      id: customer._id,
      name: customer.name,
      phone: customer.phone,
    },
    message:
      `Ready to call ${customer.name} at ${customer.phone}.`,
  };
};


/*
 * TOOL 4: GET TASKS
 */

const getTasks = async ({ userId, status }) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  const filter = {
    businessId: business._id,
    ownerId: userId,
  };

  if (status) {
    filter.status = status;
  }

  const tasks = await Task.find(filter)
    .select(
      'title description category priority status dueAt customerId invoiceId productId'
    )
    .sort({ dueAt: 1 })
    .limit(50)
    .lean();

  return {
    count: tasks.length,
    tasks,
  };
};


/*
 * =========================================================
 * WRITE TOOLS
 * =========================================================
 */


/*
 * TOOL 5: CREATE PRODUCT
 */

 /*
  * =========================================================
  * TOOL 10: CREATE INVOICE
  * =========================================================
  */

 const createInvoice = async ({
   userId,
   customerName,
   items,
   discountType,
   discountValue,
   taxPercent,
   paidAmount,
   paymentMethod,
   dueDate,
   notes,
 }) => {
   const business = await getBusiness(userId);

   if (!business) {
     throw new Error('Business workspace not found');
   }

   if (!customerName) {
     throw new Error('Customer name is required');
   }

   if (!Array.isArray(items) || items.length === 0) {
     throw new Error('At least one product is required');
   }

   /*
    * ---------------------------------------------------------
    * FIND CUSTOMER
    * ---------------------------------------------------------
    */

   const customers = await Customer.find({
     businessId: business._id,
     isActive: true,
     name: {
       $regex: customerName.trim(),
       $options: 'i',
     },
   })
     .limit(10)
     .lean();

   if (customers.length === 0) {
     throw new Error(`Customer "${customerName}" was not found`);
   }

   if (customers.length > 1) {
     throw new Error(
       `Multiple customers found with name "${customerName}". Please provide the customer's phone number.`
     );
   }

   const customer = customers[0];

   /*
    * ---------------------------------------------------------
    * FIND PRODUCTS
    * ---------------------------------------------------------
    */

   const consolidated = new Map();

   for (const item of items) {
     if (!item?.productName) {
       throw new Error('Every invoice item requires a product name');
     }

     const quantity = Math.floor(Number(item.quantity));

     if (!Number.isFinite(quantity) || quantity < 1) {
       throw new Error(
         `Invalid quantity for ${item.productName}`
       );
     }

     const products = await Product.find({
       businessId: business._id,
       ownerId: userId,
       isActive: true,
       $or: [
         {
           name: {
             $regex: `^${item.productName
               .trim()
               .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
             $options: 'i',
           },
         },
         {
           sku: item.productName.trim().toUpperCase(),
         },
       ],
     })
       .limit(5)
       .lean();

     if (products.length === 0) {
       throw new Error(
         `Product "${item.productName}" was not found`
       );
     }

     if (products.length > 1) {
       throw new Error(
         `Multiple products matched "${item.productName}". Please provide the exact product name or SKU.`
       );
     }

     const product = products[0];

     const existing = consolidated.get(
       String(product._id)
     );

     consolidated.set(
       String(product._id),
       {
         product,
         quantity: (existing?.quantity || 0) + quantity,
       }
     );
   }

   /*
    * ---------------------------------------------------------
    * BUILD INVOICE ITEMS
    * ---------------------------------------------------------
    */

   const invoiceItems = [];

   let subtotal = 0;
   let totalCost = 0;

   const stockChanges = [];

   const roundMoney = (value) =>
     Math.round(
       (Number(value) + Number.EPSILON) * 100
     ) / 100;

   for (const { product, quantity } of consolidated.values()) {
     if (product.quantity < quantity) {
       throw new Error(
         `${product.name} has only ${product.quantity} ${product.unit} available`
       );
     }

     const lineTotal = roundMoney(
       product.sellingPrice * quantity
     );

     invoiceItems.push({
       productId: product._id,
       name: product.name,
       sku: product.sku,
       unit: product.unit,
       quantity,
       unitPrice: roundMoney(product.sellingPrice),
       costPrice: roundMoney(product.costPrice),
       lineTotal,
     });

     subtotal += lineTotal;

     totalCost +=
       Number(product.costPrice) * quantity;
   }

   subtotal = roundMoney(subtotal);
   totalCost = roundMoney(totalCost);

   /*
    * ---------------------------------------------------------
    * DISCOUNT
    * ---------------------------------------------------------
    */

   const finalDiscountType =
     discountType === 'fixed'
       ? 'fixed'
       : 'percent';

   const finalDiscountValue = roundMoney(
     Number(discountValue || 0)
   );

   if (
     finalDiscountValue < 0 ||
     (
       finalDiscountType === 'percent' &&
       finalDiscountValue > 100
     )
   ) {
     throw new Error('Invalid discount');
   }

   const discountAmount = roundMoney(
     finalDiscountType === 'percent'
       ? subtotal * finalDiscountValue / 100
       : finalDiscountValue
   );

   if (discountAmount > subtotal) {
     throw new Error(
       'Discount cannot exceed the subtotal'
     );
   }

   /*
    * ---------------------------------------------------------
    * TAX
    * ---------------------------------------------------------
    */

   const taxableAmount = roundMoney(
     subtotal - discountAmount
   );

   const finalTaxPercent = roundMoney(
     Number(taxPercent || 0)
   );

   if (
     finalTaxPercent < 0 ||
     finalTaxPercent > 100
   ) {
     throw new Error(
       'Tax percentage must be between 0 and 100'
     );
   }

   const taxAmount = roundMoney(
     taxableAmount * finalTaxPercent / 100
   );

   const total = roundMoney(
     taxableAmount + taxAmount
   );

   /*
    * ---------------------------------------------------------
    * PAYMENT
    * ---------------------------------------------------------
    */

   const finalPaidAmount = roundMoney(
     Number(paidAmount || 0)
   );

   if (
     finalPaidAmount < 0 ||
     finalPaidAmount > total
   ) {
     throw new Error(
       'Paid amount must be between zero and the invoice total'
     );
   }

   const balanceDue = roundMoney(
     total - finalPaidAmount
   );

   /*
    * ---------------------------------------------------------
    * CREDIT LIMIT
    * ---------------------------------------------------------
    */

   if (
     customer.creditLimit > 0 &&
     roundMoney(
       customer.outstandingBalance + balanceDue
     ) > customer.creditLimit
   ) {
     throw new Error(
       `This sale exceeds ${customer.name}'s credit limit`
     );
   }

   /*
    * ---------------------------------------------------------
    * UPDATE STOCK
    * ---------------------------------------------------------
    */

   try {
     for (const {
       product,
       quantity,
     } of consolidated.values()) {

       const previousState = stockState(product);

       const updated =
         await Product.findOneAndUpdate(
           {
             _id: product._id,
             businessId: business._id,
             ownerId: userId,
             isActive: true,
             quantity: { $gte: quantity },
           },
           {
             $inc: {
               quantity: -quantity,
             },
           },
           {
             new: true,
           }
         );

       if (!updated) {
         throw new Error(
           `${product.name} stock changed. Please review the invoice.`
         );
       }

       stockChanges.push({
         productId: product._id,
         quantity,
         previousState,
         updated,
       });
     }

     /*
      * ---------------------------------------------------------
      * GENERATE INVOICE NUMBER
      * ---------------------------------------------------------
      */

     const counter =
       await InvoiceCounter.findOneAndUpdate(
         {
           businessId: business._id,
         },
         {
           $inc: {
             sequence: 1,
           },
         },
         {
           new: true,
           upsert: true,
           setDefaultsOnInsert: true,
         }
       );

     const now = new Date();

     const prefix =
       `${business.invoiceSettings?.prefix || 'INV'}`
         .trim()
         .toUpperCase();

     const invoiceNumber =
       `${prefix}-${now.getFullYear()}-${String(
         counter.sequence
       ).padStart(5, '0')}`;

     /*
      * ---------------------------------------------------------
      * CREATE INVOICE
      * ---------------------------------------------------------
      */

     const parsedDueDate = dueDate
       ? new Date(dueDate)
       : null;

     const invoice =
       await Invoice.create({
         businessId: business._id,
         ownerId: userId,
         customerId: customer._id,

         invoiceNumber,

         invoiceDate: new Date(),

         dueDate:
           parsedDueDate &&
           !Number.isNaN(parsedDueDate.getTime())
             ? parsedDueDate
             : null,

         customerSnapshot: {
           name: customer.name,
           phone: customer.phone,
           email: customer.email,
           address: customer.address,
           city: customer.city,
         },

         businessSnapshot: {
           name: business.businessName,
           phone: business.phone,
           businessType: business.businessType,
           email: business.email,
           addressLine1: business.addressLine1,
           addressLine2: business.addressLine2,
           city: business.city,
           state: business.state,
           pincode: business.pincode,
           gstin: business.gstin,
           pan: business.pan,
           bank: business.bank,

           invoiceSettings: {
             taxLabel:
               business.invoiceSettings?.taxLabel ||
               'GST',

             terms:
               business.invoiceSettings?.terms || '',

             footerNote:
               business.invoiceSettings?.footerNote ||
               'Thank you for your business.',

             accentColor:
               business.invoiceSettings?.accentColor ||
               '#2563EB',

             showLogo:
               business.invoiceSettings?.showLogo !== false,

             showSignature:
               business.invoiceSettings?.showSignature !== false,

             signatureLabel:
               business.invoiceSettings?.signatureLabel ||
               'Authorized Signatory',
           },
         },

         items: invoiceItems,

         subtotal,

         discountType: finalDiscountType,

         discountValue: finalDiscountValue,

         discountAmount,

         taxPercent: finalTaxPercent,

         taxAmount,

         total,

         totalCost: roundMoney(totalCost),

         grossProfit: roundMoney(
           total -
           taxAmount -
           totalCost
         ),

         paidAmount: finalPaidAmount,

         balanceDue,

         paymentStatus:
           finalPaidAmount >= total
             ? 'Paid'
             : finalPaidAmount > 0
               ? 'Partial'
               : 'Pending',

         paymentMethod:
           [
             'Cash',
             'UPI',
             'Card',
             'Bank Transfer',
             'Other',
           ].includes(paymentMethod)
             ? paymentMethod
             : 'Cash',

         notes: `${notes || ''}`.trim(),
       });

     /*
      * ---------------------------------------------------------
      * UPDATE CUSTOMER
      * ---------------------------------------------------------
      */

     await Customer.updateOne(
       {
         _id: customer._id,
         businessId: business._id,
       },
       {
         $inc: {
           totalPurchases: total,
           purchaseCount: 1,
           outstandingBalance: balanceDue,
         },

         $set: {
           lastPurchaseAt:
             invoice.invoiceDate,
         },
       }
     );

     /*
      * ---------------------------------------------------------
      * STOCK ALERTS
      * ---------------------------------------------------------
      */

     for (const change of stockChanges) {
       try {
         await notifyForStockTransition({
           product: change.updated,
           previousState:
             change.previousState,
         });
       } catch (error) {
         console.error(
           'AI invoice stock notification error:',
           error
         );
       }
     }

     /*
      * ---------------------------------------------------------
      * ACTIVITY
      * ---------------------------------------------------------
      */

     await recordActivity({
       businessId: business._id,
       ownerId: userId,
       type: 'invoice_created',
       category: 'Sales',
       title:
         `Invoice ${invoice.invoiceNumber} created`,
       description:
         `${customer.name} • ${invoice.items.length} item(s)`,
       amount: invoice.total,
       entityType: 'Invoice',
       entityId: invoice._id,
       route: '/sales',
     });

     /*
      * ---------------------------------------------------------
      * RETURN RESULT TO GEMINI
      * ---------------------------------------------------------
      */

     return {
       success: true,
       message: 'Invoice created successfully',

       invoice: {
         id: invoice._id,
         invoiceNumber: invoice.invoiceNumber,
         customerName: customer.name,
         customerPhone: customer.phone,

         items: invoice.items.map((item) => ({
           name: item.name,
           quantity: item.quantity,
           unitPrice: item.unitPrice,
           lineTotal: item.lineTotal,
         })),

         subtotal: invoice.subtotal,
         discountAmount: invoice.discountAmount,
         taxAmount: invoice.taxAmount,
         total: invoice.total,
         paidAmount: invoice.paidAmount,
         balanceDue: invoice.balanceDue,
         paymentStatus: invoice.paymentStatus,
         dueDate: invoice.dueDate,
       },
     };

   } catch (error) {

     /*
      * Roll back stock if invoice creation failed.
      */

     for (const change of stockChanges.reverse()) {
       try {
         await Product.updateOne(
           {
             _id: change.productId,
             businessId: business._id,
           },
           {
             $inc: {
               quantity: change.quantity,
             },
           }
         );
       } catch (rollbackError) {
         console.error(
           'AI invoice stock rollback failed:',
           rollbackError
         );
       }
     }

     throw error;
   }
 };

/*
 * =========================================================
 * WRITE TOOL: MARK INVOICE PAID
 * =========================================================
 */

const markInvoicePaid = async ({
  userId,
  customerName,
  invoiceNumber,
  amount,
}) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  const filter = {
    businessId: business._id,
    status: 'Active',
    paymentStatus: { $in: ['Pending', 'Partial'] },
    balanceDue: { $gt: 0 },
  };

  /*
   * Prefer invoice number when supplied.
   */
  if (invoiceNumber) {
    filter.invoiceNumber = invoiceNumber;
  }

  /*
   * Otherwise find by customer name.
   */
  if (!invoiceNumber && customerName) {
    const customer = await Customer.findOne({
      businessId: business._id,
      name: {
        $regex: `^${customerName}$`,
        $options: 'i',
      },
      isActive: true,
    }).lean();

    if (!customer) {
      throw new Error(
        `Customer "${customerName}" was not found`
      );
    }

    filter.customerId = customer._id;
  }

  if (!invoiceNumber && !customerName) {
    throw new Error(
      'Please provide a customer name or invoice number'
    );
  }

  const invoice = await Invoice.findOne(filter)
    .sort({ dueDate: 1, invoiceDate: 1 });

  if (!invoice) {
    throw new Error(
      'No pending or partially paid invoice was found'
    );
  }

  const currentBalance = Number(invoice.balanceDue || 0);

  const paymentAmount =
    amount === undefined || amount === null
      ? currentBalance
      : Number(amount);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error('Invalid payment amount');
  }

  /*
   * Never allow payment greater than outstanding balance.
   */
  if (paymentAmount > currentBalance) {
    throw new Error(
      `Payment amount ₹${paymentAmount} is greater than the outstanding balance of ₹${currentBalance}.`
    );
  }

  const previousPaidAmount =
    Number(invoice.paidAmount || 0);

  const newPaidAmount =
    previousPaidAmount + paymentAmount;

  const newBalance =
    Math.max(0, currentBalance - paymentAmount);

  invoice.paidAmount = newPaidAmount;
  invoice.balanceDue = newBalance;
  invoice.lastPaymentAt = new Date();

  invoice.paymentStatus =
    newBalance === 0
      ? 'Paid'
      : 'Partial';

  await invoice.save();

  /*
   * Keep customer outstanding balance synchronized.
   */
  if (invoice.customerId) {
    await Customer.findByIdAndUpdate(
      invoice.customerId,
      {
        $inc: {
          outstandingBalance: -paymentAmount,
        },
      }
    );
  }

  return {
    success: true,
    message: 'Payment recorded successfully',
    invoiceNumber: invoice.invoiceNumber,
    customerName:
      invoice.customerSnapshot?.name ||
      customerName ||
      '',
    paymentAmount,
    previousBalance: currentBalance,
    remainingBalance: newBalance,
    paymentStatus: invoice.paymentStatus,
  };
};

const sendInvoiceToWhatsApp = async ({
  userId,
  invoiceNumber,
  customerName,
}) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  const filter = {
    businessId: business._id,
    status: 'Active',
  };

  if (invoiceNumber) {
    filter.invoiceNumber = invoiceNumber;
  } else if (customerName) {
    filter['customerSnapshot.name'] = {
      $regex: customerName,
      $options: 'i',
    };

    filter.paymentStatus = {
      $in: ['Pending', 'Partial'],
    };
  } else {
    throw new Error(
      'Invoice number or customer name is required'
    );
  }

  const invoice = await Invoice.findOne(filter)
    .sort({ invoiceDate: -1 })
    .lean();

  if (!invoice) {
    throw new Error('No matching invoice found');
  }

  const phone = invoice.customerSnapshot?.phone;

  if (!phone) {
    throw new Error(
      'Customer does not have a phone number'
    );
  }

  // Do NOT send through WhatsApp API.
  // Return the invoice to Flutter so Flutter can
  // use the existing PDF/share functionality.

  return {
    success: true,
    action: 'share_invoice',
    invoice: invoice,
    message:
      `Invoice ${invoice.invoiceNumber} is ready to share with ${invoice.customerSnapshot.name}.`,
  };
};

const createProduct = async ({
  userId,
  name,
  sku,
  category,
  description,
  costPrice,
  sellingPrice,
  quantity,
  lowStockThreshold,
  unit,
}) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  if (!name) {
    throw new Error('Product name is required');
  }

  if (!sku) {
    throw new Error('SKU is required');
  }

  const existingProduct = await Product.findOne({
    businessId: business._id,
    sku: sku.toUpperCase(),
  });

  if (existingProduct) {
    throw new Error(
      `A product with SKU ${sku.toUpperCase()} already exists`
    );
  }

  const product = await Product.create({
    businessId: business._id,
    ownerId: userId,
    name,
    sku: sku.toUpperCase(),
    category: category || 'General',
    description: description || '',
    costPrice: Number(costPrice || 0),
    sellingPrice: Number(sellingPrice || 0),
    quantity: Number(quantity || 0),
    lowStockThreshold: Number(lowStockThreshold ?? 5),
    unit: unit || 'pcs',
    isActive: true,
    stockAlertState:
      Number(quantity || 0) === 0
        ? 'out'
        : Number(quantity || 0) <= Number(lowStockThreshold ?? 5)
          ? 'low'
          : 'healthy',
  });

  return {
    success: true,
    message: 'Product created successfully',
    product: {
      id: product._id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      quantity: product.quantity,
      unit: product.unit,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
    },
  };
};


/*
 * TOOL 6: UPDATE INVENTORY
 */

const updateInventory = async ({
  userId,
  productName,
  quantityChange,
}) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  if (!productName) {
    throw new Error('Product name is required');
  }

  const product = await Product.findOne({
    businessId: business._id,
    isActive: true,
    name: {
      $regex: `^${productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      $options: 'i',
    },
  });

  if (!product) {
    throw new Error(`Product "${productName}" was not found`);
  }

  const change = Number(quantityChange);

  if (!Number.isFinite(change) || change === 0) {
    throw new Error('Quantity change must be a non-zero number');
  }

  const newQuantity = product.quantity + change;

  if (newQuantity < 0) {
    throw new Error(
      `Cannot remove ${Math.abs(change)} units. Current stock is ${product.quantity}.`
    );
  }

  product.quantity = newQuantity;

  if (newQuantity === 0) {
    product.stockAlertState = 'out';
  } else if (newQuantity <= product.lowStockThreshold) {
    product.stockAlertState = 'low';
  } else {
    product.stockAlertState = 'healthy';
  }

  await product.save();

  return {
    success: true,
    message: 'Inventory updated successfully',
    product: {
      id: product._id,
      name: product.name,
      sku: product.sku,
      previousQuantity: newQuantity - change,
      quantityChange: change,
      newQuantity,
      stockAlertState: product.stockAlertState,
    },
  };
};


/*
 * TOOL 7: CREATE CUSTOMER
 */

const createCustomer = async ({
  userId,
  name,
  phone,
  email,
  address,
  city,
  customerType,
  notes,
  creditLimit,
}) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  if (!name) {
    throw new Error('Customer name is required');
  }

  if (!phone) {
    throw new Error('Customer phone number is required');
  }

  const existingCustomer = await Customer.findOne({
    businessId: business._id,
    phone: phone.trim(),
  });

  if (existingCustomer) {
    throw new Error(
      `A customer with phone number ${phone} already exists`
    );
  }

  const customer = await Customer.create({
    businessId: business._id,
    name,
    phone: phone.trim(),
    email: email || '',
    address: address || '',
    city: city || '',
    customerType: customerType || 'Regular',
    notes: notes || '',
    creditLimit: Number(creditLimit || 0),
    outstandingBalance: 0,
    totalPurchases: 0,
    purchaseCount: 0,
    isActive: true,
  });

  return {
    success: true,
    message: 'Customer created successfully',
    customer: {
      id: customer._id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      customerType: customer.customerType,
    },
  };
};


/*
 * TOOL 8: CREATE TASK
 */

const createTask = async ({
  userId,
  title,
  description,
  category,
  priority,
  dueAt,
  reminderMinutes,
}) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  if (!title) {
    throw new Error('Task title is required');
  }

  if (!dueAt) {
    throw new Error('Task due date/time is required');
  }

  const dueDate = new Date(dueAt);

  if (Number.isNaN(dueDate.getTime())) {
    throw new Error('Invalid task due date/time');
  }

  const reminder = Number(reminderMinutes ?? 30);

  const reminderAt = new Date(
    dueDate.getTime() - reminder * 60 * 1000
  );

  const task = await Task.create({
    businessId: business._id,
    ownerId: userId,
    title,
    description: description || '',
    category: category || 'General',
    priority: priority || 'Medium',
    status: 'Pending',
    dueAt: dueDate,
    reminderMinutes: reminder,
    reminderAt,
    customerId: null,
    invoiceId: null,
    productId: null,
    isRecurring: false,
    recurrenceFrequency: 'None',
  });

  return {
    success: true,
    message: 'Task created successfully',
    task: {
      id: task._id,
      title: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      status: task.status,
      dueAt: task.dueAt,
    },
  };
};


/*
 * TOOL 9: CREATE EXPENSE
 */

const createExpense = async ({
  userId,
  title,
  category,
  amount,
  expenseDate,
  paymentStatus,
  paymentMethod,
  dueDate,
  vendor,
  description,
  transactionReference,
  referenceNumber,
}) => {
  const business = await getBusiness(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  if (!title) {
    throw new Error('Expense title is required');
  }

  if (!amount || Number(amount) <= 0) {
    throw new Error('Expense amount must be greater than zero');
  }

  const parsedExpenseDate = expenseDate
    ? new Date(expenseDate)
    : new Date();

  if (Number.isNaN(parsedExpenseDate.getTime())) {
    throw new Error('Invalid expense date');
  }

  let parsedDueDate = null;

  if (dueDate) {
    parsedDueDate = new Date(dueDate);

    if (Number.isNaN(parsedDueDate.getTime())) {
      throw new Error('Invalid expense due date');
    }
  }

  const finalPaymentStatus = paymentStatus || 'Paid';

  const expense = await Expense.create({
    businessId: business._id,
    ownerId: userId,
    title,
    category: category || 'Other',
    amount: Number(amount),
    expenseDate: parsedExpenseDate,
    paymentStatus: finalPaymentStatus,
    paymentMethod: paymentMethod || 'Cash',
    dueDate: parsedDueDate,
    paidAt: finalPaymentStatus === 'Paid' ? new Date() : null,
    transactionReference: transactionReference || '',
    referenceNumber: referenceNumber || '',
    vendor: vendor || '',
    description: description || '',
    isRecurring: false,
    recurrenceFrequency: 'None',
  });

  return {
    success: true,
    message: 'Expense created successfully',
    expense: {
      id: expense._id,
      title: expense.title,
      category: expense.category,
      amount: expense.amount,
      paymentStatus: expense.paymentStatus,
      paymentMethod: expense.paymentMethod,
      expenseDate: expense.expenseDate,
      vendor: expense.vendor,
    },
  };
};


/*
 * =========================================================
 * GEMINI TOOL DEFINITIONS
 * =========================================================
 */

const geminiTools = [
  {
    functionDeclarations: [

      /*
       * -------------------------
       * READ TOOLS
       * -------------------------
       */

      {
        name: 'get_inventory',
        description:
          'Get WorkPilot inventory products. Use this for questions about stock, products, categories, prices, low-stock products, or out-of-stock products.',
        parameters: {
          type: 'OBJECT',
          properties: {
            search: {
              type: 'STRING',
              description:
                'Optional product name, SKU, or category to search for.',
            },
            stockStatus: {
              type: 'STRING',
              enum: ['all', 'low', 'out'],
              description:
                'Use low for low-stock products, out for out-of-stock products, and all otherwise.',
            },
          },
        },
      },

      {
        name: 'call_customer',
        description:
          'Prepare to call an existing WorkPilot customer. Use this when the business owner explicitly asks to call or phone a customer. The app will open the phone dialer with the customer number.',
        parameters: {
          type: 'OBJECT',
          properties: {
            customerName: {
              type: 'STRING',
              description:
                'Name of the existing WorkPilot customer to call.',
            },
          },
          required: ['customerName'],
        },
      },

      {
        name: 'get_pending_payments',
        description:
          'Get invoices that have pending or partially paid balances for the current WorkPilot business.',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },

      {
        name: 'get_customers',
        description:
          'Find WorkPilot customers by name, phone, or email.',
        parameters: {
          type: 'OBJECT',
          properties: {
            search: {
              type: 'STRING',
              description:
                'Customer name, phone number, or email.',
            },
          },
        },
      },

      {
        name: 'get_tasks',
        description:
          'Get WorkPilot tasks, including pending, completed, overdue, and upcoming tasks.',
        parameters: {
          type: 'OBJECT',
          properties: {
            status: {
              type: 'STRING',
              enum: ['Pending', 'Completed'],
              description: 'Optional task status filter.',
            },
          },
        },
      },
      {
        name: 'mark_invoice_paid',
        description:
          'Record a payment against a pending or partially paid invoice for the current WorkPilot business. Use this when the user explicitly asks to record, complete, or mark an invoice payment as paid.',
        parameters: {
          type: 'OBJECT',
          properties: {
            customerName: {
              type: 'STRING',
              description:
                'Customer name whose pending invoice should receive the payment.',
            },
            invoiceNumber: {
              type: 'STRING',
              description:
                'Invoice number if the user provides one, for example INV-2026-00002.',
            },
            amount: {
              type: 'NUMBER',
              description:
                'Payment amount in INR. If omitted, the full outstanding balance is paid.',
            },
          },
        },
      },


      /*
       * -------------------------
       * WRITE TOOLS
       * -------------------------
       */
       {
         name: 'send_invoice_whatsapp',
         description:
             'Prepare an existing WorkPilot invoice for sharing through WhatsApp. Use this when the business owner explicitly asks to send an invoice on WhatsApp. The invoice will be opened in the app share sheet so the user can select WhatsApp and send it.',
         parameters: {
           type: 'OBJECT',
           properties: {
             invoiceNumber: {
               type: 'STRING',
               description:
                 'Optional invoice number such as INV-2026-00004.',
             },
             customerName: {
               type: 'STRING',
               description:
                 'Optional customer name such as Raju.',
             },
           },
         },
       },
       {
         name: 'create_invoice',

         description:
           'Create a real sales invoice in WorkPilot for an existing customer and existing inventory products. Use this when the user explicitly asks to create, make, or generate an invoice.',

         parameters: {
           type: 'OBJECT',

           properties: {

             customerName: {
               type: 'STRING',
               description:
                 'Name of the existing WorkPilot customer.'
             },

             items: {
               type: 'ARRAY',

               description:
                 'Products and quantities that should be included in the invoice.',

               items: {
                 type: 'OBJECT',

                 properties: {

                   productName: {
                     type: 'STRING',
                     description:
                       'Existing product name or SKU.'
                   },

                   quantity: {
                     type: 'NUMBER',
                     description:
                       'Quantity of the product to sell.'
                   },

                 },

                 required: [
                   'productName',
                   'quantity'
                 ],
               },
             },

             discountType: {
               type: 'STRING',
               enum: [
                 'percent',
                 'fixed'
               ],
               description:
                 'Discount type. Defaults to percent.'
             },

             discountValue: {
               type: 'NUMBER',
               description:
                 'Discount value. Defaults to 0.'
             },

             taxPercent: {
               type: 'NUMBER',
               description:
                 'GST/tax percentage. Defaults to 0.'
             },

             paidAmount: {
               type: 'NUMBER',
               description:
                 'Amount paid by customer now. Defaults to 0.'
             },

             paymentMethod: {
               type: 'STRING',
               enum: [
                 'Cash',
                 'UPI',
                 'Card',
                 'Bank Transfer',
                 'Other'
               ],
               description:
                 'Payment method.'
             },

             dueDate: {
               type: 'STRING',
               description:
                 'Optional invoice due date in ISO format.'
             },

             notes: {
               type: 'STRING',
               description:
                 'Optional invoice notes.'
             },
           },

           required: [
             'customerName',
             'items'
           ],
         },
       },

      {
        name: 'create_product',
        description:
          'Create a new product in the current WorkPilot business inventory. Use only when the user explicitly asks to add or create a product.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: {
              type: 'STRING',
              description: 'Product name.',
            },
            sku: {
              type: 'STRING',
              description: 'Unique SKU for the product.',
            },
            category: {
              type: 'STRING',
              description: 'Product category.',
            },
            description: {
              type: 'STRING',
              description: 'Optional product description.',
            },
            costPrice: {
              type: 'NUMBER',
              description: 'Product cost price.',
            },
            sellingPrice: {
              type: 'NUMBER',
              description: 'Product selling price.',
            },
            quantity: {
              type: 'NUMBER',
              description: 'Initial inventory quantity.',
            },
            lowStockThreshold: {
              type: 'NUMBER',
              description: 'Low stock threshold.',
            },
            unit: {
              type: 'STRING',
              description: 'Unit such as pcs, kg, box, litre.',
            },
          },
          required: [
            'name',
            'sku',
            'costPrice',
            'sellingPrice',
            'quantity',
          ],
        },
      },

      {
        name: 'update_inventory',
        description:
          'Increase or decrease stock for an existing WorkPilot product.',
        parameters: {
          type: 'OBJECT',
          properties: {
            productName: {
              type: 'STRING',
              description: 'Existing product name.',
            },
            quantityChange: {
              type: 'NUMBER',
              description:
                'Positive number adds stock. Negative number removes stock.',
            },
          },
          required: [
            'productName',
            'quantityChange',
          ],
        },
      },

      {
        name: 'create_customer',
        description:
          'Create a new customer in the current WorkPilot business.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: {
              type: 'STRING',
              description: 'Customer name.',
            },
            phone: {
              type: 'STRING',
              description: 'Customer phone number.',
            },
            email: {
              type: 'STRING',
              description: 'Customer email.',
            },
            address: {
              type: 'STRING',
              description: 'Customer address.',
            },
            city: {
              type: 'STRING',
              description: 'Customer city.',
            },
            customerType: {
              type: 'STRING',
              enum: [
                'Regular',
                'VIP',
                'Wholesale',
              ],
              description: 'Customer type.',
            },
            notes: {
              type: 'STRING',
              description: 'Optional customer notes.',
            },
            creditLimit: {
              type: 'NUMBER',
              description: 'Optional customer credit limit.',
            },
          },
          required: [
            'name',
            'phone',
          ],
        },
      },

      {
        name: 'create_task',
        description:
          'Create a new WorkPilot task or reminder.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: {
              type: 'STRING',
              description: 'Task title.',
            },
            description: {
              type: 'STRING',
              description: 'Task description.',
            },
            category: {
              type: 'STRING',
              enum: [
                'Payment',
                'Customer',
                'Inventory',
                'Delivery',
                'General',
              ],
              description: 'Task category.',
            },
            priority: {
              type: 'STRING',
              enum: [
                'Low',
                'Medium',
                'High',
                'Urgent',
              ],
              description: 'Task priority.',
            },
            dueAt: {
              type: 'STRING',
              description:
                'Task due date/time in ISO format.',
            },
            reminderMinutes: {
              type: 'NUMBER',
              description:
                'Reminder minutes before the task. Allowed values: 0, 15, 30, 60, 180, 1440.',
            },
          },
          required: [
            'title',
            'dueAt',
          ],
        },
      },

      {
        name: 'create_expense',
        description:
          'Create a new expense in WorkPilot.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: {
              type: 'STRING',
              description: 'Expense title.',
            },
            category: {
              type: 'STRING',
              enum: [
                'Rent',
                'Salary',
                'Utilities',
                'Transport',
                'Marketing',
                'Supplies',
                'Maintenance',
                'Tax',
                'Other',
              ],
              description: 'Expense category.',
            },
            amount: {
              type: 'NUMBER',
              description: 'Expense amount in INR.',
            },
            expenseDate: {
              type: 'STRING',
              description:
                'Expense date in ISO format.',
            },
            paymentStatus: {
              type: 'STRING',
              enum: [
                'Unpaid',
                'Paid',
              ],
              description: 'Expense payment status.',
            },
            paymentMethod: {
              type: 'STRING',
              enum: [
                'Not selected',
                'Cash',
                'UPI',
                'Card',
                'Bank Transfer',
                'Cheque',
                'Other',
              ],
              description: 'Payment method.',
            },
            dueDate: {
              type: 'STRING',
              description:
                'Optional expense due date.',
            },
            vendor: {
              type: 'STRING',
              description: 'Vendor name.',
            },
            description: {
              type: 'STRING',
              description: 'Expense description.',
            },
            transactionReference: {
              type: 'STRING',
              description:
                'Optional transaction reference.',
            },
            referenceNumber: {
              type: 'STRING',
              description:
                'Optional reference number.',
            },
          },
          required: [
            'title',
            'amount',
          ],
        },
      },
    ],
  },
];


module.exports = {
  geminiTools,

  // READ
  getInventory,
  getPendingPayments,
  getCustomers,
  getTasks,

  // WRITE
  createProduct,
  updateInventory,
  createCustomer,
  createTask,
  createExpense,
  markInvoicePaid,
  createInvoice,
  sendInvoiceToWhatsApp,
  callCustomer
};