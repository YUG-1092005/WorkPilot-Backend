const { GoogleGenAI } = require('@google/genai');
const {
  sendPaymentReminder,
} = require('../controllers/smsController');
const {
  geminiTools,
  getInventory,
  getPendingPayments,
  getCustomers,
  getTasks,
  createProduct,
  updateInventory,
  createCustomer,
  createTask,
  createExpense,
  createInvoice,
  markInvoicePaid,
  sendInvoiceToWhatsApp,
  callCustomer,
} = require('./aiTools');

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL =
  process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';


const SYSTEM_INSTRUCTION = `
You are WorkPilot AI, an operations assistant inside the WorkPilot
business management application.

WorkPilot helps businesses manage:

- inventory
- customers
- sales
- invoices
- payments
- tasks
- expenses
- reports

Your job is to help the authenticated business owner understand and
operate their WorkPilot data.

IMPORTANT RULES:

1. Only use information returned by WorkPilot tools.
2. Never invent inventory, customer, payment, invoice, or task data.
3. Never expose another business's information.
4. Use tools whenever the user asks about actual WorkPilot data.
5. Be concise and practical.
6. Currency is INR unless the data says otherwise.
7. If the user asks for an operation that changes data, do not pretend
   it was completed unless the backend actually executed it.
8. If a requested capability is not available, clearly say so.
9. Never make up IDs.
10. Do not directly access MongoDB. Use the available tools.
`;


/*
 * ---------------------------------------------------------
 * TOOL EXECUTOR
 * ---------------------------------------------------------
 */

const executeTool = async (name, args, userId) => {
  switch (name) {

    /*
     * =========================
     * READ TOOLS
     * =========================
     */

    case 'get_inventory':
      return await getInventory({
        userId,
        search: args?.search || '',
        stockStatus: args?.stockStatus || 'all',
      });

    case 'get_pending_payments':
      return await getPendingPayments({
        userId,
      });

    case 'get_customers':
      return await getCustomers({
        userId,
        search: args?.search || '',
      });

    case 'get_tasks':
      return await getTasks({
        userId,
        status: args?.status || '',
      });


    /*
     * =========================
     * WRITE TOOLS
     * =========================
     */

     case 'create_invoice':
       return await createInvoice({
         userId,
         customerName: args?.customerName,
         items: args?.items || [],
         discountType: args?.discountType || 'percent',
         discountValue: args?.discountValue || 0,
         taxPercent: args?.taxPercent || 0,
         paidAmount: args?.paidAmount || 0,
         paymentMethod: args?.paymentMethod || 'Cash',
         dueDate: args?.dueDate || null,
         notes: args?.notes || '',
       });

    case 'mark_invoice_paid':
      return await markInvoicePaid({
        userId,
        customerName: args?.customerName,
        invoiceNumber: args?.invoiceNumber,
        amount: args?.amount,
      });

    case 'send_payment_sms':
      return await sendPaymentReminder({
        userId,
        invoiceNumber: args?.invoiceNumber,
        customerName: args?.customerName,
        customMessage: args?.message,
      });

    case 'call_customer':
      return await callCustomer({
        userId,
        customerName: args?.customerName,
      });

    case 'call_customer':
      return await callCustomer({
        userId,
        customerName: args?.customerName,
      });

    case 'create_product':
      return await createProduct({
        userId,
        name: args?.name,
        sku: args?.sku,
        category: args?.category,
        description: args?.description,
        costPrice: args?.costPrice,
        sellingPrice: args?.sellingPrice,
        quantity: args?.quantity,
        lowStockThreshold: args?.lowStockThreshold,
        unit: args?.unit,
      });

    case 'update_inventory':
      return await updateInventory({
        userId,
        productName: args?.productName,
        quantityChange: args?.quantityChange,
      });

    case 'create_customer':
      return await createCustomer({
        userId,
        name: args?.name,
        phone: args?.phone,
        email: args?.email,
        address: args?.address,
        city: args?.city,
        customerType: args?.customerType,
        notes: args?.notes,
        creditLimit: args?.creditLimit,
      });

    case 'create_task':
      return await createTask({
        userId,
        title: args?.title,
        description: args?.description,
        category: args?.category,
        priority: args?.priority,
        dueAt: args?.dueAt,
        reminderMinutes: args?.reminderMinutes,
      });

    case 'create_expense':
      return await createExpense({
        userId,
        title: args?.title,
        category: args?.category,
        amount: args?.amount,
        expenseDate: args?.expenseDate,
        paymentStatus: args?.paymentStatus,
        paymentMethod: args?.paymentMethod,
        dueDate: args?.dueDate,
        vendor: args?.vendor,
        description: args?.description,
        transactionReference: args?.transactionReference,
        referenceNumber: args?.referenceNumber,
      });

    default:
      throw new Error(`Unknown AI tool: ${name}`);
  }
};


/*
 * ---------------------------------------------------------
 * MAIN GEMINI CHAT
 * ---------------------------------------------------------
 */

const chatWithGemini = async ({
  message,
  history = [],
  userId,
}) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const contents = [];

  for (const item of history) {
    if (!item?.role || !item?.text) continue;

    contents.push({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [
        {
          text: item.text,
        },
      ],
    });
  }

  contents.push({
    role: 'user',
    parts: [
      {
        text: message,
      },
    ],
  });

  let currentContents = [...contents];

  const allToolCalls = [];

  /*
   * Allow Gemini to perform multiple tool calls.
   *
   * Example:
   *
   * User
   *   ↓
   * Gemini
   *   ↓
   * get_inventory
   *   ↓
   * Gemini
   *   ↓
   * final answer
   */

  for (let round = 0; round < 5; round++) {
    console.log(`Gemini AI round ${round + 1}`);

    const response = await ai.models.generateContent({
      model: MODEL,

      contents: currentContents,

      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: geminiTools,
        temperature: 0.2,
      },
    });

    const candidate = response.candidates?.[0];

    if (!candidate) {
      throw new Error('Gemini returned no response');
    }

    const modelContent = candidate.content;

    const parts = modelContent?.parts || [];

    /*
     * Find function calls WITHOUT touching response.text.
     */

    const functionCalls = parts
      .filter((part) => part?.functionCall)
      .map((part) => part.functionCall);

    /*
     * ---------------------------------------------------------
     * NO FUNCTION CALL
     * ---------------------------------------------------------
     */

    if (functionCalls.length === 0) {
      let text = '';

      for (const part of parts) {
        if (typeof part?.text === 'string') {
          text += part.text;
        }
      }

      if (!text.trim()) {
        text = 'I could not generate a response.';
      }

      return {
        message: text,
        toolCalls: allToolCalls,
      };
    }

    /*
     * ---------------------------------------------------------
     * FUNCTION CALLS FOUND
     * ---------------------------------------------------------
     */

    const functionResponses = [];

    for (const call of functionCalls) {
      const toolName = call.name;
      const toolArgs = call.args || {};

      console.log('Gemini requested tool:', toolName);
      console.log('Tool arguments:', toolArgs);


        try {
          const result = await executeTool(
            toolName,
            toolArgs,
            userId
          );

          console.log(
            `Tool ${toolName} executed successfully`
          );

          allToolCalls.push({
            name: toolName,
            arguments: toolArgs,
            result,
          });

          // Invoice sharing is a Flutter UI action.
          // Do not send this tool result back to Gemini.
          if (
            (
              toolName === 'send_invoice_whatsapp' &&
              result?.action === 'share_invoice'
            ) ||
            (
              toolName === 'call_customer' &&
              result?.action === 'call_customer'
            )
          ) {
            return {
              message: result.message,
              toolCalls: allToolCalls,
            };
          }

          functionResponses.push({
            functionResponse: {
              name: toolName,
              response: {
                result,
              },
            },
          });
        } catch (error) {
          console.error(
            `AI tool ${toolName} failed:`,
            error
          );

          allToolCalls.push({
            name: toolName,
            arguments: toolArgs,
            error: error.message,
          });

          functionResponses.push({
            functionResponse: {
              name: toolName,
              response: {
                error: error.message,
              },
            },
          });
        }
    }

    /*
     * ---------------------------------------------------------
     * SEND GEMINI'S FUNCTION CALL + RESULTS BACK
     * ---------------------------------------------------------
     */

    currentContents = [
      ...currentContents,

      /*
       * Gemini's original response containing
       * the functionCall parts.
       */
      modelContent,

      /*
       * Results returned by our backend tools.
       */
      {
        role: 'user',
        parts: functionResponses,
      },
    ];
  }

  /*
   * Prevent infinite tool loops.
   */

  return {
    message:
      'I was unable to complete the requested operation after several steps.',
    toolCalls: allToolCalls,
  };
};


module.exports = {
  chatWithGemini,
};