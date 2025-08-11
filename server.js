require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('./config/passport');
const authRoutes = require('./routes/auth');
const entityService = require('./services/entityService');
const supabaseService = require('./services/supabaseService');
const { validateDatabaseConnection, handleDatabaseError } = require('./middleware/databaseMiddleware');
const { validateAccess, requireAuth } = require('./middleware/authMiddleware');
const { createResponse, bulkResponse, errorResponse } = require('./utils/responseUtils');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CLIENT_SECRET);

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

// Session middleware  
const isProduction = process.env.NODE_ENV === 'production';
console.log('SESSION_SECRET exists:', !!process.env.SESSION_SECRET);
console.log('SESSION_SECRET length:', process.env.SESSION_SECRET?.length || 'undefined');

app.set('trust proxy', 1); // required for sessions to work properly in production

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: true,
  saveUninitialized: true,
  name: 'connect.sid',
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    dbName: 'sessions',
    collectionName: 'user_sessions',
    ttl: 24 * 60 * 60
  }),
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: isProduction ? 'none' : 'lax', // Change back to 'none' for cross-site
    domain: isProduction ? undefined : 'localhost' // Remove domain restriction
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Stripe webhook route MUST be defined BEFORE express.json() middleware
// to preserve raw body for signature verification
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  console.log('Webhook signature:', sig);
  console.log('Request body type:', typeof req.body);
  console.log('Request body length:', req.body?.length);
  console.log('Is Buffer:', Buffer.isBuffer(req.body));
  console.log('Webhook secret configured:', !!endpointSecret);
  console.log('Webhook secret length:', endpointSecret?.length);
  console.log('Webhook secret starts with:', endpointSecret?.substring(0, 10));

  let event;

  try {
    // Verify webhook signature using platform Stripe instance
    // req.body should be a Buffer when using express.raw()
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    console.error('Body preview:', req.body.toString().substring(0, 100));
    
    // Try to manually verify to debug the issue
    const timestamp = sig.split(',')[0].split('=')[1];
    const v1Signature = sig.split('v1=')[1]?.split(',')[0];
    console.error('Extracted timestamp:', timestamp);
    console.error('Extracted v1 signature:', v1Signature);
    
    // TEMPORARY: Parse event without signature verification for debugging
    console.log('TEMPORARY: Parsing event without signature verification');
    try {
      event = JSON.parse(req.body.toString());
      console.log('Event parsed successfully:', event.type, event.id);
    } catch (parseErr) {
      console.error('Failed to parse JSON:', parseErr.message);
      return res.status(400).send(`JSON Parse Error: ${parseErr.message}`);
    }
  }

  // For Connect accounts, the event will have an 'account' property
  const connectedAccountId = event.account;
  console.log('Received webhook event:', event.type, 'ID:', event.id, 'Account:', connectedAccountId);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object, connectedAccountId);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object, connectedAccountId);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object, connectedAccountId);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, connectedAccountId);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object, connectedAccountId);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object, connectedAccountId);
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

// Auth routes
app.use('/auth', authRoutes);

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
// STRIPE ROUTES
// =============================================================================

// GET /stripe/checkout/:appId/prices/:priceId - Create a checkout session and redirect to Stripe Checkout
app.get('/stripe/checkout/:appId/prices/:priceId', async (req, res) => {
  try {
    const { appId, priceId } = req.params;
    
    // Get Stripe account details from Supabase
    const stripeAccount = await supabaseService.getStripeAccount(appId);
    
    if (!stripeAccount) {
      return res.status(404).json(errorResponse(
        'Stripe account not found',
        'No Stripe account configured for this app',
        404
      ));
    }

    // Create Stripe instance for the connected account
    const connectedStripe = require('stripe')(stripeAccount.access_token);
    
    // Validate that the price exists and belongs to this app
    let price;
    try {
      price = await connectedStripe.prices.retrieve(priceId, {
        expand: ['product']
      });
      
      // Check if the price is active
      if (!price.active) {
        return res.status(400).json(errorResponse(
          'Price not available',
          'The selected price is not currently active',
          400
        ));
      }
      
      // Check if the product belongs to this app
      if (!price.product.metadata || price.product.metadata.manifest_app_id !== appId) {
        return res.status(403).json(errorResponse(
          'Price not accessible',
          'The selected price does not belong to this app',
          403
        ));
      }
    } catch (error) {
      return res.status(404).json(errorResponse(
        'Price not found',
        'The specified price does not exist',
        404
      ));
    }

    // Determine checkout mode based on price type
    const mode = price.recurring ? 'subscription' : 'payment';

    // Create Stripe checkout session using the price ID
    const session = await connectedStripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: mode,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${req.protocol}://${req.get('host')}/stripe/success?session_id={CHECKOUT_SESSION_ID}&app_id=${appId}`,
      cancel_url: `${req.protocol}://${req.get('host')}/stripe/cancel?app_id=${appId}`,
    });

    // Redirect to Stripe Checkout
    res.redirect(session.url);
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    res.status(500).json(errorResponse(error, 'Failed to create checkout session'));
  }
});

// GET /stripe/portal/:appId - Create customer portal session
app.get('/stripe/portal/:appId', requireAuth, async (req, res) => {
  try {
    const { appId } = req.params;
    const userId = req.user.id;
    
    // Get Stripe account details from Supabase
    const stripeAccount = await supabaseService.getStripeAccount(appId);
    
    if (!stripeAccount) {
      return res.status(404).json(errorResponse(
        'Stripe account not found',
        'No Stripe account configured for this app',
        404
      ));
    }

    // Get customer ID for this user and app
    const customer = await supabaseService.getStripeCustomer(userId, appId);
    
    if (!customer || !customer.stripe_customer_id) {
      return res.status(404).json(errorResponse(
        'Customer not found',
        'No active subscription found for this user',
        404
      ));
    }

    // Create customer portal session using the connected account
    const connectedStripe = require('stripe')(stripeAccount.access_token);
    const session = await connectedStripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${req.protocol}://${req.get('host')}/dashboard`,
    });

    // Redirect to Stripe Customer Portal
    res.redirect(session.url);
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    res.status(500).json(errorResponse(error, 'Failed to create customer portal session'));
  }
});

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
      <p><a href="/stripe/checkout/${app_id}">Try Again</a></p>
    </body>
    </html>
  `);
});

// Webhook handler functions
async function handleCheckoutCompleted(session, connectedAccountId) {
  // Find which app this connected account belongs to
  const appId = await getAppIdFromStripeAccount(connectedAccountId);
  
  console.log('Checkout completed:', {
    session_id: session.id,
    customer_id: session.customer,
    subscription_id: session.subscription,
    payment_intent_id: session.payment_intent,
    mode: session.mode,
    amount_total: session.amount_total,
    currency: session.currency,
    customer_email: session.customer_details?.email,
    metadata: session.metadata,
    connected_account: connectedAccountId,
    app_id: appId
  });

  // TODO: Save customer and payment data to database
  // This is where you'd create/update user subscription status
}

async function handleSubscriptionCreated(subscription, connectedAccountId) {
  const appId = await getAppIdFromStripeAccount(connectedAccountId);
  
  console.log('Subscription created:', {
    subscription_id: subscription.id,
    customer_id: subscription.customer,
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000),
    current_period_end: new Date(subscription.current_period_end * 1000),
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    items: subscription.items.data.map(item => ({
      price_id: item.price.id,
      quantity: item.quantity
    })),
    connected_account: connectedAccountId,
    app_id: appId
  });

  // TODO: Grant user access to app features based on subscription
}

async function handleSubscriptionUpdated(subscription, connectedAccountId) {
  const appId = await getAppIdFromStripeAccount(connectedAccountId);
  
  console.log('Subscription updated:', {
    subscription_id: subscription.id,
    customer_id: subscription.customer,
    status: subscription.status,
    previous_attributes: subscription.previous_attributes,
    items: subscription.items.data.map(item => ({
      price_id: item.price.id,
      quantity: item.quantity
    })),
    connected_account: connectedAccountId,
    app_id: appId
  });

  // TODO: Update user access based on new subscription details
  // Handle plan changes, status changes (active, canceled, past_due)
}

async function handleSubscriptionDeleted(subscription, connectedAccountId) {
  const appId = await getAppIdFromStripeAccount(connectedAccountId);
  
  console.log('Subscription deleted:', {
    subscription_id: subscription.id,
    customer_id: subscription.customer,
    status: subscription.status,
    canceled_at: new Date(subscription.canceled_at * 1000),
    connected_account: connectedAccountId,
    app_id: appId
  });

  // TODO: Revoke user access when subscription is canceled
}

async function handleInvoicePaymentSucceeded(invoice, connectedAccountId) {
  const appId = await getAppIdFromStripeAccount(connectedAccountId);
  
  console.log('Invoice payment succeeded:', {
    invoice_id: invoice.id,
    customer_id: invoice.customer,
    subscription_id: invoice.subscription,
    amount_paid: invoice.amount_paid,
    currency: invoice.currency,
    period_start: new Date(invoice.period_start * 1000),
    period_end: new Date(invoice.period_end * 1000),
    connected_account: connectedAccountId,
    app_id: appId
  });

  // TODO: Extend subscription period, send receipt
}

async function handleInvoicePaymentFailed(invoice, connectedAccountId) {
  const appId = await getAppIdFromStripeAccount(connectedAccountId);
  
  console.log('Invoice payment failed:', {
    invoice_id: invoice.id,
    customer_id: invoice.customer,
    subscription_id: invoice.subscription,
    amount_due: invoice.amount_due,
    attempt_count: invoice.attempt_count,
    connected_account: connectedAccountId,
    app_id: appId
  });

  // TODO: Notify user of failed payment, potentially suspend access
}

// Helper function to find app ID from Stripe account ID
async function getAppIdFromStripeAccount(stripeAccountId) {
  try {
    const appData = await supabaseService.getAppByStripeAccount(stripeAccountId);
    return appData?.id || null;
  } catch (error) {
    console.error('Error finding app for Stripe account:', stripeAccountId, error);
    return null;
  }
}

// GET /stripe/prices/:appId - Get all active prices for an app
app.get('/stripe/prices/:appId', async (req, res) => {
  try {
    const { appId } = req.params;
    
    // Get Stripe account details from Supabase
    const stripeAccount = await supabaseService.getStripeAccount(appId);
    
    if (!stripeAccount) {
      return res.status(404).json(errorResponse(
        'Stripe account not found',
        'No Stripe account configured for this app',
        404
      ));
    }

    // Create Stripe instance for the connected account
    const connectedStripe = require('stripe')(stripeAccount.access_token);
    
    // Get all products with the matching metadata
    const products = await connectedStripe.products.list({
      active: true,
      expand: ['data.default_price']
    });
    
    // Filter products that have the matching app metadata
    const appProducts = products.data.filter(product => 
      product.metadata && product.metadata.manifest_app_id === appId
    );
    
    if (appProducts.length === 0) {
      return res.json(createResponse([], 0, appId, 'prices'));
    }
    
    // Get all prices for these products
    const allPrices = [];
    
    for (const product of appProducts) {
      const prices = await connectedStripe.prices.list({
        product: product.id,
        active: true
      });
      
      // Add product info to each price for context
      const pricesWithProduct = prices.data.map(price => ({
        ...price,
        product_info: {
          id: product.id,
          name: product.name,
          description: product.description,
          metadata: product.metadata
        }
      }));
      
      allPrices.push(...pricesWithProduct);
    }
    
    res.json(createResponse(allPrices, allPrices.length, appId, 'prices'));
  } catch (error) {
    console.error('Error fetching Stripe prices:', error);
    res.status(500).json(errorResponse(error, 'Failed to fetch prices'));
  }
});

// =============================================================================
// CONFIG ROUTES
// =============================================================================

// GET /:appId/config - Get project configuration from Supabase
app.get('/:appId/config', async (req, res) => {
  try {
    const { appId } = req.params;
    const config = await supabaseService.getProjectConfig(appId);
    
    res.json(config);
  } catch (error) {
    console.error('Error fetching project config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project configuration'
    });
  }
});

// =============================================================================
// MONGODB API ROUTES
// =============================================================================

// READ operations
// GET /:appId/entities/:collection - Get all documents
app.get('/:appId/entities/:collection', validateAccess, async (req, res) => {
  
  console.log('User:', req.user)

  try {
    const { appId, collection } = req.params;
    const documents = await entityService.getAllDocuments(appId, collection);
    
    res.json(createResponse(documents, documents.length, appId, collection));
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to fetch documents'));
  }
});

// GET /:appId/entities/:collection/:id - Get single document
app.get('/:appId/entities/:collection/:id', validateAccess, async (req, res) => {
  try {
    const { appId, collection, id } = req.params;
    const document = await entityService.getDocumentById(appId, collection, id);
    
    res.json(createResponse(document, null, appId, collection));
  } catch (error) {
    console.error('Error fetching document:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(errorResponse(error, 'Document not found', 404));
    } else {
      res.status(500).json(errorResponse(error, 'Failed to fetch document'));
    }
  }
});

// CREATE operations
// POST /:appId/entities/:collection - Create single document
app.post('/:appId/entities/:collection', validateAccess, async (req, res) => {
  try {
    const { appId, collection } = req.params;
    const documentData = req.body;
    
    if (!documentData || Object.keys(documentData).length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body is required and cannot be empty',
        400
      ));
    }
    
    const createdDocument = await entityService.createDocument(appId, collection, documentData);
    
    res.status(201).json(createResponse(createdDocument, null, appId, collection));
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json(errorResponse(error, 'Failed to create document'));
  }
});

// POST /:appId/entities/:collection/bulk - Create multiple documents
app.post('/:appId/entities/:collection/bulk', validateAccess, async (req, res) => {
  try {
    const { appId, collection } = req.params;
    const { documents } = req.body;
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body must contain a "documents" array with at least one document',
        400
      ));
    }
    
    const results = await entityService.bulkCreateDocuments(appId, collection, documents);
    
    res.status(201).json(bulkResponse(results, appId, collection));
  } catch (error) {
    console.error('Error creating documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to create documents'));
  }
});

// UPDATE operations
// PUT /:appId/entities/:collection/:id - Update single document
app.put('/:appId/entities/:collection/:id', validateAccess, async (req, res) => {
  try {
    const { appId, collection, id } = req.params;
    const updateData = req.body;
    
    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body is required and cannot be empty',
        400
      ));
    }
    
    const updatedDocument = await entityService.updateDocument(appId, collection, id, updateData);
    
    res.json(createResponse(updatedDocument, null, appId, collection));
  } catch (error) {
    console.error('Error updating document:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(errorResponse(error, 'Document not found', 404));
    } else {
      res.status(500).json(errorResponse(error, 'Failed to update document'));
    }
  }
});

// PUT /:appId/entities/:collection/bulk - Update multiple documents
app.put('/:appId/entities/:collection/bulk', validateAccess, async (req, res) => {
  try {
    const { appId, collection } = req.params;
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body must contain an "updates" array with at least one update object containing "id" and update data',
        400
      ));
    }
    
    // Validate that each update has an id
    const invalidUpdates = updates.filter(update => !update.id);
    if (invalidUpdates.length > 0) {
      return res.status(400).json(errorResponse(
        'Invalid update objects',
        'Each update object must contain an "id" field',
        400
      ));
    }
    
    const results = await entityService.bulkUpdateDocuments(appId, collection, updates);
    
    res.json(bulkResponse(results, appId, collection));
  } catch (error) {
    console.error('Error updating documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to update documents'));
  }
});

// DELETE operations
// DELETE /:appId/entities/:collection/:id - Delete single document
app.delete('/:appId/entities/:collection/:id', validateAccess, async (req, res) => {
  try {
    const { appId, collection, id } = req.params;
    const deletedDocument = await entityService.deleteDocument(appId, collection, id);
    
    res.json(createResponse(deletedDocument, null, appId, collection));
  } catch (error) {
    console.error('Error deleting document:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(errorResponse(error, 'Document not found', 404));
    } else {
      res.status(500).json(errorResponse(error, 'Failed to delete document'));
    }
  }
});

// DELETE /:appId/entities/:collection/bulk - Delete multiple documents
app.delete('/:appId/entities/:collection/bulk', validateAccess, async (req, res) => {
  try {
    const { appId, collection } = req.params;
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body must contain an "ids" array with at least one document ID',
        400
      ));
    }
    
    const results = await entityService.bulkDeleteDocuments(appId, collection, ids);
    
    res.json(bulkResponse(results, appId, collection));
  } catch (error) {
    console.error('Error deleting documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to delete documents'));
  }
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
      api: '/:appId/entities/:collection'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`MongoDB API Server is running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
  console.log(`API endpoints available at: http://localhost:${PORT}/{appId}/entities/{collection}`);
});