require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('./config/passport');
const authRoutes = require('./routes/authRoutes');
const appRoutes = require('./routes/appRoutes');
const supabaseService = require('./services/supabaseService');
const sessionService = require('./services/sessionService');
const { validateDatabaseConnection, handleDatabaseError } = require('./middleware/databaseMiddleware');
const { errorResponse } = require('./utils/responseUtils');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CLIENT_SECRET);
const {
  handleCheckoutCompleted,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
  handlePaymentIntentCreated,
  handlePaymentIntentSucceeded,
  handleChargeSucceeded,
  handleChargeUpdated
} = require('./utils/stripeHelpers');

const app = express();
const PORT = process.env.PORT || 3500;

// CORS middleware
app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

// Cookie and session middleware  
const isProduction = process.env.NODE_ENV === 'production';
console.log('SESSION_SECRET exists:', !!process.env.SESSION_SECRET);
console.log('SESSION_PEPPER exists:', !!process.env.SESSION_PEPPER);

app.set('trust proxy', 1); // required for sessions to work properly in production

app.use(cookieParser());

// Passport middleware (no session)
app.use(passport.initialize());

// Attach user from session middleware - only for routes that need it
// app.use(sessionService.attachUserFromSession);

// Stripe webhook route MUST be defined BEFORE express.json() middleware
// to preserve raw body for signature verification
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;

  try {
    // Verify webhook signature using platform Stripe instance
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('✅ Webhook verified:', event.type, event.id);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // For Connect accounts, the event will have an 'account' property
  const connectedAccountId = event.account;

  try {
    switch (event.type) {
      // Checkout events
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object, connectedAccountId);
        break;

      // Subscription events
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object, connectedAccountId);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object, connectedAccountId);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, connectedAccountId);
        break;

      // Invoice events
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object, connectedAccountId);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object, connectedAccountId);
        break;

      // Payment events
      case 'payment_intent.created':
        await handlePaymentIntentCreated(event.data.object, connectedAccountId);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object, connectedAccountId);
        break;

      case 'charge.succeeded':
        await handleChargeSucceeded(event.data.object, connectedAccountId);
        break;

      case 'charge.updated':
        await handleChargeUpdated(event.data.object, connectedAccountId);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Other body parser middleware (AFTER webhook route)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth routes - add session middleware
app.use('/auth', sessionService.attachUserFromSession, authRoutes);

// App routes - all routes under /apps/:appId
app.use('/apps/:appId', appRoutes);

// Apply database middleware to all API routes
app.use('/', validateDatabaseConnection);
app.use('/', handleDatabaseError);

// Global OPTIONS handler as fallback
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// =============================================================================
// STRIPE WEBHOOK ROUTES
// =============================================================================

// GET /stripe/success - Handle successful payment
app.get('/stripe/success', async (req, res) => {
  try {
    const { session_id, app_id } = req.query;
    
    if (!session_id || !app_id) {
      return res.status(400).json(errorResponse(
        'Missing parameters',
        'Session ID and App ID are required',
        400
      ));
    }

    // Get Stripe account for this app
    const stripeAccount = await supabaseService.getStripeAccount(app_id);
    if (!stripeAccount) {
      return res.status(404).json(errorResponse('Stripe account not found', 'No Stripe account configured', 404));
    }

    // Retrieve session details
    const connectedStripe = require('stripe')(stripeAccount.access_token);
    const session = await connectedStripe.checkout.sessions.retrieve(session_id, {
      expand: ['customer', 'subscription', 'payment_intent', 'line_items']
    });

    // Extract key information
    const paymentData = {
      session_id: session.id,
      customer_id: session.customer,
      subscription_id: session.subscription,
      payment_intent_id: session.payment_intent,
      mode: session.mode,
      amount_total: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_details?.email,
      app_id: app_id,
      created_at: new Date()
    };

    // TODO: Save this data to your database
    // Example: await supabaseService.savePaymentData(paymentData);
    
    console.log('Payment successful:', paymentData);

    // Show success page or redirect
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Payment Successful</title></head>
      <body>
        <h1>Payment Successful!</h1>
        <p>Thank you for your purchase.</p>
        <p>Customer ID: ${session.customer}</p>
        ${session.subscription ? `<p>Subscription ID: ${session.subscription}</p>` : ''}
        <p><a href="/dashboard">Go to Dashboard</a></p>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error handling payment success:', error);
    res.status(500).json(errorResponse(error, 'Failed to process successful payment'));
  }
});

// GET /stripe/cancel - Handle cancelled payment
app.get('/stripe/cancel', async (req, res) => {
  const { app_id } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Payment Cancelled</title></head>
    <body>
      <h1>Payment Cancelled</h1>
      <p>Your payment was cancelled. No charges were made.</p>
      <p><a href="/apps/${app_id}/stripe/checkout">Try Again</a></p>
    </body>
    </html>
  `);
});



// =============================================================================
// HEALTH CHECK AND ROOT ENDPOINTS
// =============================================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'MongoDB API Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'MongoDB API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/apps/:appId/entities/:collection'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`MongoDB API Server is running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
  console.log(`API endpoints available at: http://localhost:${PORT}/apps/{appId}/entities/{collection}`);
});