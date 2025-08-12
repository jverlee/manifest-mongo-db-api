const express = require('express');
const router = express.Router({ mergeParams: true });
const entityService = require('../services/entityService');
const supabaseService = require('../services/supabaseService');
const sessionService = require('../services/sessionService');
const { validateAccess, requireAuth } = require('../middleware/authMiddleware');
const { createResponse, bulkResponse, errorResponse } = require('../utils/responseUtils');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CLIENT_SECRET);

// =============================================================================
// STRIPE ROUTES
// =============================================================================

// GET /apps/:appId/stripe/checkout/prices/:priceId - Create a checkout session and redirect to Stripe Checkout
router.get('/stripe/checkout/prices/:priceId', async (req, res) => {
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

// GET /apps/:appId/stripe/portal - Create customer portal session
router.get('/stripe/portal', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId } = req.params;
    const userId = req.auth.endUserId;
    
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

// GET /apps/:appId/config - Get app configuration from Supabase
router.get('/config', sessionService.attachUserFromSession, async (req, res) => {
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
});

// =============================================================================
// AUTH ROUTES
// =============================================================================

// GET /apps/:appId/me - Get current user information
router.get('/me', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId } = req.params;
    
    // Return user information from req.auth
    res.json(req.auth);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user information'
    });
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