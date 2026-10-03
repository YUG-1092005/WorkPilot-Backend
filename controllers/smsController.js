const Business = require('../models/Business');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const { sendSms } = require('../services/smsGatewayService');

const getUserId = (req) => req.userId || req.user?._id || req.user?.id;

const getBusinessForUser = (userId) =>
  Business.findOne({ ownerId: userId });

const buildPaymentReminder = ({
  customerName,
  amount,
  invoiceNumber,
  businessName,
}) => {
  const safeCustomer = String(customerName || 'Customer').trim();
  const safeAmount = Number(amount || 0).toLocaleString('en-IN');
  const safeInvoice = String(invoiceNumber || '').trim();
  const safeBusiness = String(businessName || 'WorkPilot Business').trim();

  return [
    `Dear ${safeCustomer},`,
    `your payment of Rs. ${safeAmount} is pending for invoice ${safeInvoice}.`,
    `Please make the payment at your earliest convenience.`,
    `- ${safeBusiness}`,
  ].join(' ');
};

const findPendingInvoice = async ({ businessId, invoiceNumber, customerName }) => {
  const filter = {
    businessId,
    status: 'Active',
    paymentStatus: { $in: ['Pending', 'Partial'] },
    balanceDue: { $gt: 0 },
  };

  if (invoiceNumber) {
    filter.invoiceNumber = invoiceNumber;
  } else if (customerName) {
    filter['customerSnapshot.name'] = {
      $regex: String(customerName).trim(),
      $options: 'i',
    };
  } else {
    throw new Error('invoiceNumber or customerName is required');
  }

  return Invoice.findOne(filter)
    .sort({ dueDate: 1, invoiceDate: 1, createdAt: 1 });
};

const resolveCustomerPhone = async (invoice) => {
  if (invoice.customerId) {
    const customer = await Customer.findById(invoice.customerId)
      .select('name phone')
      .lean();

    if (customer?.phone) {
      return {
        name: customer.name || invoice.customerSnapshot?.name || 'Customer',
        phone: customer.phone,
      };
    }
  }

  if (invoice.customerSnapshot?.phone) {
    return {
      name: invoice.customerSnapshot?.name || 'Customer',
      phone: invoice.customerSnapshot.phone,
    };
  }

  throw new Error('Customer does not have a phone number');
};

const sendPaymentReminder = async ({
  userId,
  invoiceNumber,
  customerName,
  customMessage,
}) => {
  const business = await getBusinessForUser(userId);

  if (!business) {
    throw new Error('Business workspace not found');
  }

  const invoice = await findPendingInvoice({
    businessId: business._id,
    invoiceNumber,
    customerName,
  });

  if (!invoice) {
    throw new Error('No pending or partially paid invoice found');
  }

  const customer = await resolveCustomerPhone(invoice);

  const message = customMessage?.trim()
    ? customMessage.trim()
    : buildPaymentReminder({
        customerName: customer.name,
        amount: invoice.balanceDue,
        invoiceNumber: invoice.invoiceNumber,
        businessName: business.name,
      });

  const gatewayResult = await sendSms({
    phone: customer.phone,
    message,
  });

  return {
    success: true,
    message: `Payment reminder sent to ${customer.name}.`,
    customerName: customer.name,
    phone: gatewayResult.phoneNumber,
    invoiceNumber: invoice.invoiceNumber,
    balanceDue: Number(invoice.balanceDue || 0),
    smsText: message,
    providerStatus: gatewayResult.providerStatus,
  };
};

const sendPaymentReminderHttp = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await sendPaymentReminder({
      userId,
      invoiceNumber: req.body?.invoiceNumber,
      customerName: req.body?.customerName,
      customMessage: req.body?.message,
    });

    return res.status(202).json(result);
  } catch (error) {
    console.error('Send payment reminder error:', error);

    return res.status(400).json({
      message: error.message || 'Failed to send SMS payment reminder',
    });
  }
};

module.exports = {
  buildPaymentReminder,
  sendPaymentReminder,
  sendPaymentReminderHttp,
};
