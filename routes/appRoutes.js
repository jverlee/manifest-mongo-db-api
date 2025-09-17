const express = require('express');
const router = express.Router({ mergeParams: true });
const entityService = require('../services/entityService');
const supabaseService = require('../services/supabaseService');
const sessionService = require('../services/sessionService');
const { validateAccess, requireAuth } = require('../middleware/authMiddleware');
const { createResponse, bulkResponse, errorResponse } = require('../utils/responseUtils');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CLIENT_SECRET);
const supabaseUtils = require('../utils/supabaseUtils');

// =============================================================================
// STRIPE ROUTES
// =============================================================================

// GET /apps/:appId/stripe/checkout/prices/:priceId - Create a checkout session and redirect to Stripe Checkout
router.get('/stripe/checkout/prices/:priceId', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId, priceId } = req.params;

    // successUrl from query params
    const successUrl = req.query.successUrl;
    const cancelUrl = req.query.cancelUrl;
    
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

    // Build checkout session parameters
    const sessionParams = {
      payment_method_types: ['card'],
      mode: mode,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${req.protocol}://${req.get('host')}/apps/${appId}/stripe/checkout/verify?forwardUrl=${encodeURIComponent(successUrl || 'https://app.madewithmanifest.com/')}&session_id={CHECKOUT_SESSION_ID}`,
      // cancel url intentionally not set to simplify code - users can use the back button
      //cancel_url: cancelUrl ? `${req.protocol}://${req.get('host')}/apps/${appId}/stripe/checkout/cancel?forwardUrl=${encodeURIComponent(cancelUrl)}` : null,
      metadata: {
        manifest_app_id: appId,
        manifest_app_user_id: req.auth.appUserId
      }
    };

    // Attach metadata to the subscription or payment intent based on mode
    if (mode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: {
          manifest_app_id: appId,
          manifest_app_user_id: req.auth.appUserId
        }
      };
    } else {
      sessionParams.payment_intent_data = {
        metadata: {
          manifest_app_id: appId,
          manifest_app_user_id: req.auth.appUserId
        }
      };
    }

    // Create Stripe checkout session
    const session = await connectedStripe.checkout.sessions.create(sessionParams);

    // Redirect to Stripe Checkout
    res.redirect(session.url);
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    res.status(500).json(errorResponse(error, 'Failed to create checkout session'));
  }
});

// GET /apps/:appId/stripe/portal - Create customer portal session
router.get('/stripe/portal', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  
  // get returnUrl from query params
  const returnUrl = req.query.returnUrl;
  
  try {
    const { appId } = req.params;
    const userId = req.auth.appUserId;
    
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
    const customerId = await supabaseService.getStripeCustomerId(userId, appId);
    
    if (!customerId) {
      return res.status(404).json(errorResponse(
        'Customer not found',
        'No active subscription found for this user',
        404
      ));
    }

    // Create customer portal session using the connected account
    const connectedStripe = require('stripe')(stripeAccount.access_token);
    const session = await connectedStripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    // Redirect to Stripe Customer Portal
    res.redirect(session.url);
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    res.status(500).json(errorResponse(error, 'Failed to create customer portal session'));
  }
});

// GET /apps/:appId/stripe/verify - Handle successful payment and verify webhook updates before forwarding on
router.get('/stripe/checkout/verify', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  const { forwardUrl } = req.query;
  const redirectUrl = forwardUrl || '/';

  if (!req.auth) {
    return res.status(401).send('Transaction could not be completed');
  }

  const { appId, appUserId } = req.auth;
  const maxRetries = 10; // 10 seconds total (10 x 1 second)
  let retryCount = 0;

  // Function to check billing status with retries
  const checkBillingStatus = async () => {
    try {
      const userDetails = await supabaseService.getAppUser(appId, appUserId);
      
      if (userDetails.billing_status === 'current') {
        // Success - redirect immediately
        return res.redirect(redirectUrl);
      }
      
      // If not ready yet and we haven't exceeded max retries
      if (retryCount < maxRetries) {
        retryCount++;
        // Wait 1 second and try again
        setTimeout(checkBillingStatus, 1000);
      } else {
        // Timeout - show error message
        res.status(400).send('Transaction could not be completed');
      }
    } catch (error) {
      console.error('Error checking billing status:', error);
      res.status(500).send('Transaction could not be completed');
    }
  };

  // Start checking
  checkBillingStatus();
});

// GET /apps/:appId/stripe/cancel - Handle cancelled payment
router.get('/stripe/checkout/cancel', sessionService.attachUserFromSession, async (req, res) => {
  const { forwardUrl } = req.query;
  const redirectUrl = forwardUrl || '/';
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Verifying Cancellation</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background-color: #f5f5f5;
        }
        h1 {
          color: #333;
          font-size: 48px;
          font-weight: 300;
        }
      </style>
      <script>
        setTimeout(function() {
          window.location.href = '${redirectUrl}';
        }, 5000);
      </script>
    </head>
    <body>
      <h1>Verifying</h1>
    </body>
    </html>
  `);
});

// GET /apps/:appId/stripe/prices - Get all active prices for an app
router.get('/stripe/prices', async (req, res) => {
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
    
    // Get all products with the matching metadata using async iteration
    const appProducts = [];
    
    // Use async iteration to handle pagination automatically
    for await (const product of connectedStripe.products.list({
      active: true,
      limit: 100,
      expand: ['data.default_price']
    })) {
      // Check if product has matching app metadata
      if (product.metadata?.manifest_app_id === appId) {
        appProducts.push(product);
      }
    }

    console.log(`Found ${appProducts.length} products for app ${appId}`);


    // If no products are found for this app, return an empty array
    if (appProducts.length === 0) {
      return res.json([]);
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
    
    res.json(allPrices);
  } catch (error) {
    console.error('Error fetching Stripe prices:', error);
    res.status(500).json(errorResponse(error, 'Failed to fetch prices'));
  }
});

// =============================================================================
// CONFIG ROUTES
// =============================================================================

// GET /apps/:appId/config - Get app configuration from Supabase
router.get('/config', sessionService.attachUserFromSession, async (req, res) => {

  // determine url based on NODE_ENV is production or development
  let url = '';
  if (process.env.NODE_ENV == 'development') {
    url = 'http://localhost:3100/preview/manifest-config.json';
  // if req.headers['host'] includes fly.dev, use https://manifest-app-[appId].fly.dev/preview/manifest-config.json
  } else if (req.headers['referer'].includes('fly.dev')) {
    url = `https://manifest-app-${req.params.appId}.fly.dev/preview/manifest-config.json`;
  // else assume production and use https://[appId].sites.madewithmanifest.com/manifest-config.json
  } else {
    url = `https://${req.params.appId}.sites.madewithmanifest.com/preview/manifest-config.json`;
  }

  console.log('req.headers', req.headers);
  console.log('req.headers-referer', req.headers['referer']);
  console.log('url', url);
  console.log('data', data);
  
  const response = await fetch(url);
  const data = await response.json();

  res.json(data);
  return;

  /* 
  try {
    const { appId } = req.params;
    const config = await supabaseService.getAppConfig(appId);
    
    res.json(config);
  } catch (error) {
    console.error('Error fetching app config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch app configuration'
    });
  }
   */
});

// =============================================================================
// AUTH ROUTES
// =============================================================================

// GET /apps/:appId/me - Get current user information
router.get('/me', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId } = req.params;
    const appUserId = req.auth.appUserId;

    // lookup user from app_users where app_id = appId and app_user_id = appUserId
    const user = await supabaseService.getAppUser(appId, appUserId);

    res.json(
      {
        appId: appId,
        appUserId: appUserId,
        billingStatus: user.billing_status,
        displayName: user.display_name,
        email: user.primary_email
      }
    )


  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user information'
    });
  }
});

// POST /apps/:appId/logout - Logout user
router.post('/logout', sessionService.attachUserFromSession, requireAuth, async (req, res, next) => {
  try {
    const { appId, tokenHash } = req.auth;
    await sessionService.deleteSession(appId, tokenHash);
    res.clearCookie(sessionService.cookieNameFor(appId), {
      ...sessionService.getCookieOptions(req.hostname, appId),
      expires: new Date(0)
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Logout error:', error);
    return next(error);
  }
});


// =============================================================================
// BACKEND FUNCTIONS
// =============================================================================

// Proxy all requests to backend functions
router.all('/backend-functions/:functionName', sessionService.attachUserFromSession, validateAccess, async (req, res) => {

  try {
    const { appId, functionName } = req.params;
    
    // Get the backend function URL from Supabase
    const backendUrl = await supabaseUtils.getBackendFunctionUrl(appId, functionName);
    
    // Prepare fetch options
    const fetchOptions = {
      method: req.method,
      headers: {
        ...req.headers,
        // Remove host header to avoid issues
        host: undefined,
        // Forward original host as custom header if needed
        'x-forwarded-host': req.headers.host,
        'x-forwarded-for': req.ip,
        'x-original-url': req.originalUrl
      }
    };
    
    // Add body for methods that support it
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      if (req.headers['content-type']?.includes('application/json')) {
        fetchOptions.body = JSON.stringify(req.body);
      } else {
        // For non-JSON content types, send raw body if available
        fetchOptions.body = req.body;
      }
    }
    
    // Make the request to the backend function
    const response = await fetch(backendUrl, fetchOptions);
    
    // Copy response headers
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      // Skip certain headers that shouldn't be forwarded
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });
    
    // Set response headers
    Object.entries(responseHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    
    // Set status code
    res.status(response.status);
    
    // Stream the response body
    const responseBody = await response.text();
    
    // Try to parse as JSON if content-type indicates it
    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        res.json(JSON.parse(responseBody));
      } catch {
        // If parsing fails, send as text
        res.send(responseBody);
      }
    } else {
      res.send(responseBody);
    }
    
  } catch (error) {
    console.error('Error proxying backend function:', error);
    
    if (error.message?.includes('not found')) {
      res.status(404).json(errorResponse(
        'Backend function not found',
        `The backend function '${req.params.functionName}' is not configured for this app`,
        404
      ));
    } else {
      res.status(500).json(errorResponse(
        error,
        'Failed to execute backend function',
        500
      ));
    }
  }
});



// =============================================================================
// MONGODB API ROUTES
// =============================================================================

// Add session middleware to entity routes that need authentication
router.use('/entities', sessionService.attachUserFromSession);

// READ operations
// GET /apps/:appId/entities/:collection - Get all documents
router.get('/entities/:collection', validateAccess, async (req, res) => {
  
  console.log('Auth:', req.auth)

  try {
    const { appId, collection } = req.params;
    const documents = await entityService.getAllDocuments(appId, collection);
    
    res.json(createResponse(documents, documents.length, appId, collection));
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to fetch documents'));
  }
});

// GET /apps/:appId/entities/:collection/:id - Get single document
router.get('/entities/:collection/:id', validateAccess, async (req, res) => {
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
// POST /apps/:appId/entities/:collection - Create single document
router.post('/entities/:collection', validateAccess, async (req, res) => {
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

// POST /apps/:appId/entities/:collection/bulk - Create multiple documents
router.post('/entities/:collection/bulk', validateAccess, async (req, res) => {
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
// PUT /apps/:appId/entities/:collection/:id - Update single document
router.put('/entities/:collection/:id', validateAccess, async (req, res) => {
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

// PUT /apps/:appId/entities/:collection/bulk - Update multiple documents
router.put('/entities/:collection/bulk', validateAccess, async (req, res) => {
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
// DELETE /apps/:appId/entities/:collection/:id - Delete single document
router.delete('/entities/:collection/:id', validateAccess, async (req, res) => {
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

// DELETE /apps/:appId/entities/:collection/bulk - Delete multiple documents
router.delete('/entities/:collection/bulk', validateAccess, async (req, res) => {
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

module.exports = router;