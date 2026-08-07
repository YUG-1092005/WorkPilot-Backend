require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDatabase = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const customerRoutes = require('./routes/customerRoutes');
const salesRoutes = require('./routes/salesRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const taskRoutes = require('./routes/taskRoutes');
const reportRoutes = require('./routes/reportRoutes');
const profileRoutes = require('./routes/profileRoutes');
const activityRoutes = require('./routes/activityRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { handleWebhook } = require('./controllers/paymentController');

const app = express();

connectDatabase();

app.use(helmet());
app.use(cors());
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buffer) => {
    if (req.originalUrl === '/api/payments/webhook') req.rawBody = Buffer.from(buffer);
  },
}));

app.get('/', (req, res) => {
  res.json({ message: 'WorkPilot API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/activities', activityRoutes);
// Public callback from Razorpay. Its signature is verified using the untouched request body.
app.post('/api/payments/webhook', handleWebhook);
app.use('/api/payments', paymentRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'API endpoint not found' });
});

app.use((error, req, res, next) => {
  console.error('Unhandled API error:', error);
  res.status(500).json({ message: 'Unexpected server error' });
});

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`WorkPilot server running on port ${port}`);
});
