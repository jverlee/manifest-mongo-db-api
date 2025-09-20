const express = require('express');
const router = express.Router({ mergeParams: true });
const entityService = require('../services/entityService');
const supabaseService = require('../services/supabaseService');
const sessionService = require('../services/sessionService');
const { validateAccess, requireAuth } = require('../middleware/authMiddleware');
const { createResponse, bulkResponse, errorResponse } = require('../utils/responseUtils');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CLIENT_SECRET);
const supabaseUtils = require('../utils/supabaseUtils');
const { getAppConfig, detectEnvironment } = require('../utils/appConfigUtils');
const { getCheckoutSimulationHTML } = require('../utils/checkoutSimulationTemplate');
const { getPortalSimulationHTML } = require('../utils/portalSimulationTemplate');

// =============================================================================
// STRIPE ROUTES
// =============================================================================

// GET /apps/:appId/stripe/checkout/prices/:priceId - Create a checkout session and redirect to Stripe Checkout
router.get('/stripe/checkout/prices/:priceId', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId, priceId } = req.params;

    // successUrl from query params
    let successUrl = req.query.successUrl;
    const cancelUrl = req.query.cancelUrl;
    
    // Default success URL based on environment
    if (!successUrl) {
      const environment = detectEnvironment(req);
      if (environment === 'local') {
        successUrl = 'http://localhost:3100/preview/';
      } else if (environment === 'editing') {
        successUrl = `https://manifest-app-${appId}.fly.dev/preview/`;
      } else {
        successUrl = `https://${appId}.sites.madewithmanifest.com/`;
      }
    }
    
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

    // Redirect based on environment
    const environment = detectEnvironment(req);
    if (environment === 'production') {
      res.redirect(session.url);
    } else {
      // redirect to simulate route
      res.redirect(`/apps/${appId}/stripe/checkout/prices/${priceId}/simulate`);
    }
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    res.status(500).json(errorResponse(error, 'Failed to create checkout session'));
  }
});

// GET /apps/:appId/stripe/checkout/prices/:priceId/simulate
router.get('/stripe/checkout/prices/:priceId/simulate', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
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
    
    // Fetch price details
    let priceInfo = {};
    try {
      const price = await connectedStripe.prices.retrieve(priceId, {
        expand: ['product']
      });
      
      priceInfo = {
        amount: price.unit_amount,
        currency: price.currency,
        productName: price.product.name || 'Product',
        interval: price.recurring?.interval || null
      };
    } catch (error) {
      console.error('Error fetching price details:', error);
      // Use default values if price fetch fails
    }
    
    // Send the simulation HTML
    res.send(getCheckoutSimulationHTML(appId, priceId, priceInfo));
  } catch (error) {
    console.error('Error in checkout simulation:', error);
    res.status(500).json(errorResponse(error, 'Failed to load checkout simulation'));
  }
});

// POST /apps/:appId/stripe/simulate/subscribe - Simulate subscription in non-production environments
router.post('/stripe/simulate/subscribe', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId } = req.params;
    const { priceId } = req.body;
    
    // Only allow in non-production environments
    const environment = detectEnvironment(req);
    if (environment === 'production') {
      return res.status(403).json(errorResponse(
        'Forbidden',
        'Simulation endpoints are not available in production',
        403
      ));
    }
    
    if (!priceId) {
      return res.status(400).json(errorResponse(
        'Invalid request',
        'priceId is required',
        400
      ));
    }
    
    // Store simulation data in a secure cookie
    const simulationData = {
      status: 'current',
      priceId: priceId,
      subscribedAt: new Date().toISOString(),
      appId: appId,
      appUserId: req.auth.appUserId
    };
    
    // Set simulation cookie (expires in 30 days)
    const cookieName = `sim_billing_${appId}`;
    res.cookie(cookieName, JSON.stringify(simulationData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: `/apps/${appId}`
    });
    
    res.json({
      success: true,
      simulation: {
        billingStatus: 'current',
        priceId: priceId,
        message: 'Simulation subscription created successfully'
      }
    });
    
  } catch (error) {
    console.error('Error creating simulation subscription:', error);
    res.status(500).json(errorResponse(error, 'Failed to create simulation subscription'));
  }
});

// POST /apps/:appId/stripe/simulate/restore - Restore simulation from localStorage after login
router.post('/stripe/simulate/restore', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId } = req.params;
    const { simulationData } = req.body;
    
    // Only allow in non-production environments
    const environment = detectEnvironment(req);
    if (environment === 'production') {
      return res.status(403).json(errorResponse(
        'Forbidden',
        'Simulation endpoints are not available in production',
        403
      ));
    }
    
    if (!simulationData || !simulationData.priceId) {
      return res.status(400).json(errorResponse(
        'Invalid request',
        'simulationData with priceId is required',
        400
      ));
    }
    
    // Verify the simulation data is for the current app
    if (simulationData.appId !== appId) {
      return res.status(400).json(errorResponse(
        'Invalid request',
        'Simulation data does not match current app',
        400
      ));
    }
    
    // Restore simulation data in cookie
    const restoredData = {
      status: simulationData.billingStatus || 'current',
      priceId: simulationData.priceId,
      subscribedAt: simulationData.timestamp || new Date().toISOString(),
      appId: appId,
      appUserId: req.auth.appUserId,
      restored: true
    };
    
    // Set simulation cookie
    const cookieName = `sim_billing_${appId}`;
    res.cookie(cookieName, JSON.stringify(restoredData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: `/apps/${appId}`
    });
    
    res.json({
      success: true,
      message: 'Simulation restored successfully'
    });
    
  } catch (error) {
    console.error('Error restoring simulation:', error);
    res.status(500).json(errorResponse(error, 'Failed to restore simulation'));
  }
});

// POST /apps/:appId/stripe/simulate/cancel - Cancel simulation subscription
router.post('/stripe/simulate/cancel', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId } = req.params;
    
    // Only allow in non-production environments
    const environment = detectEnvironment(req);
    if (environment === 'production') {
      return res.status(403).json(errorResponse(
        'Forbidden',
        'Simulation endpoints are not available in production',
        403
      ));
    }
    
    // Instead of clearing the cookie, set the status to canceled
    const cookieName = `sim_billing_${appId}`;
    const canceledData = {
      status: 'canceled',
      appId: appId,
      appUserId: req.auth.appUserId,
      canceledAt: new Date().toISOString(),
      // Keep the original priceId for reference
      priceId: null
    };
    
    // Set canceled simulation cookie
    res.cookie(cookieName, JSON.stringify(canceledData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: `/apps/${appId}`
    });
    
    console.log('Cancel simulation - setting cookie:', {
      cookieName,
      canceledData,
      appId,
      appUserId: req.auth.appUserId
    });
    
    res.json({
      success: true,
      message: 'Simulation subscription canceled successfully'
    });
    
  } catch (error) {
    console.error('Error canceling simulation subscription:', error);
    res.status(500).json(errorResponse(error, 'Failed to cancel simulation subscription'));
  }
});

// POST /apps/:appId/stripe/simulate/reactivate - Reactivate canceled simulation subscription
router.post('/stripe/simulate/reactivate', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId } = req.params;
    
    // Only allow in non-production environments
    const environment = detectEnvironment(req);
    if (environment === 'production') {
      return res.status(403).json(errorResponse(
        'Forbidden',
        'Simulation endpoints are not available in production',
        403
      ));
    }
    
    // Clear the simulation cookie to revert to real subscription state
    const cookieName = `sim_billing_${appId}`;
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: `/apps/${appId}`
    });
    
    console.log('Reactivate simulation - clearing cookie:', {
      cookieName,
      appId,
      appUserId: req.auth.appUserId
    });
    
    res.json({
      success: true,
      message: 'Simulation subscription reactivated - restored to real billing state'
    });
    
  } catch (error) {
    console.error('Error reactivating simulation subscription:', error);
    res.status(500).json(errorResponse(error, 'Failed to reactivate simulation subscription'));
  }
});

// POST /apps/:appId/stripe/simulate/upgrade - Upgrade simulation subscription plan
router.post('/stripe/simulate/upgrade', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId } = req.params;
    const { newPriceId } = req.body;
    
    // Only allow in non-production environments
    const environment = detectEnvironment(req);
    if (environment === 'production') {
      return res.status(403).json(errorResponse(
        'Forbidden',
        'Simulation endpoints are not available in production',
        403
      ));
    }
    
    if (!newPriceId) {
      return res.status(400).json(errorResponse(
        'Invalid request',
        'newPriceId is required',
        400
      ));
    }
    
    // Get existing simulation data
    const cookieName = `sim_billing_${appId}`;
    const simulationCookie = req.cookies[cookieName];
    let simulationData = {
      status: 'current',
      appId: appId,
      appUserId: req.auth.appUserId,
      subscribedAt: new Date().toISOString()
    };
    
    if (simulationCookie) {
      try {
        const parsed = JSON.parse(simulationCookie);
        if (parsed.appId === appId && parsed.appUserId === req.auth.appUserId) {
          simulationData = { ...parsed };
        }
      } catch (e) {
        console.error('Error parsing simulation cookie:', e);
      }
    }
    
    // Update the price ID
    simulationData.priceId = newPriceId;
    simulationData.upgradeAt = new Date().toISOString();
    
    // Set updated simulation cookie
    res.cookie(cookieName, JSON.stringify(simulationData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: `/apps/${appId}`
    });
    
    res.json({
      success: true,
      simulation: {
        billingStatus: 'current',
        priceId: newPriceId,
        message: 'Simulation plan upgrade completed successfully'
      }
    });
    
  } catch (error) {
    console.error('Error upgrading simulation subscription:', error);
    res.status(500).json(errorResponse(error, 'Failed to upgrade simulation subscription'));
  }
});

// GET /apps/:appId/stripe/portal - Create customer portal session
router.get('/stripe/portal', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  
  // get returnUrl from query params
  const returnUrl = req.query.returnUrl;
  
  try {
    const { appId } = req.params;
    const userId = req.auth.appUserId;
    
    // Check environment - redirect to simulation in non-production
    const environment = detectEnvironment(req);
    if (environment !== 'production') {
      return res.redirect(`/apps/${appId}/stripe/portal/simulate?returnUrl=${encodeURIComponent(returnUrl || '')}`);
    }
    
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

// GET /apps/:appId/stripe/portal/simulate - Simulate customer portal for development
router.get('/stripe/portal/simulate', sessionService.attachUserFromSession, requireAuth, async (req, res) => {
  try {
    const { appId } = req.params;
    const userId = req.auth.appUserId;
    
    // Only allow in non-production environments
    const environment = detectEnvironment(req);
    if (environment === 'production') {
      return res.status(403).json(errorResponse(
        'Forbidden',
        'Portal simulation is not available in production',
        403
      ));
    }
    
    // Get user data
    const userData = await supabaseService.getAppUser(appId, userId);
    
    // Get Stripe account details
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
    
    // Check for simulation data first
    const cookieName = `sim_billing_${appId}`;
    const simulationCookie = req.cookies[cookieName];
    let simulationData = {};
    let currentSubscription = null;
    
    if (simulationCookie) {
      try {
        const parsed = JSON.parse(simulationCookie);
        if (parsed.appId === appId && parsed.appUserId === userId) {
          simulationData = parsed;
          // If simulation is canceled, don't create a currentSubscription
          if (parsed.status === 'canceled') {
            currentSubscription = null;
          }
          // If we have simulation data and it's not canceled, try to get real price info for the simulated price
          else if (parsed.priceId) {
            try {
              const price = await connectedStripe.prices.retrieve(parsed.priceId, {
                expand: ['product']
              });
              currentSubscription = {
                id: 'sim_' + parsed.priceId,
                status: parsed.status,
                current_period_start: new Date(parsed.subscribedAt || new Date()).getTime() / 1000,
                items: {
                  data: [{
                    price: price
                  }]
                }
              };
            } catch (e) {
              console.error('Error fetching simulated price details:', e);
            }
          }
        }
      } catch (e) {
        console.error('Error parsing simulation cookie:', e);
      }
    }
    
    // If no simulation data or simulation is not explicitly canceled, check for real subscription
    if (!currentSubscription && userData.billing_status === 'current' && simulationData.status !== 'canceled') {
      const activeSubscription = await supabaseService.getActiveSubscription(appId, userId);
      if (activeSubscription && activeSubscription.stripe_subscription_id) {
        try {
          currentSubscription = await connectedStripe.subscriptions.retrieve(
            activeSubscription.stripe_subscription_id,
            { expand: ['items.data.price.product'] }
          );
        } catch (e) {
          console.error('Error fetching real subscription:', e);
        }
      }
    }
    
    // Get all available plans for this app
    const availablePlans = [];
    try {
      // Get all products with the matching metadata using async iteration
      const appProducts = [];
      
      for await (const product of connectedStripe.products.list({
        active: true,
        limit: 100,
        expand: ['data.default_price']
      })) {
        if (product.metadata?.manifest_app_id === appId) {
          appProducts.push(product);
        }
      }

      // Get all prices for these products
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
        
        availablePlans.push(...pricesWithProduct);
      }
    } catch (e) {
      console.error('Error fetching available plans:', e);
    }
    
    // Send the simulation HTML
    res.send(getPortalSimulationHTML(appId, userData, simulationData, availablePlans, currentSubscription));
    
  } catch (error) {
    console.error('Error in portal simulation:', error);
    res.status(500).json(errorResponse(error, 'Failed to load portal simulation'));
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

// GET /apps/:appId/config - Get app configuration
router.get('/config', sessionService.attachUserFromSession, async (req, res) => {
  try {
    const { appId } = req.params;
    const config = await getAppConfig(appId, req);
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
    const appUserId = req.auth.appUserId;

    // lookup user from app_users where app_id = appId and app_user_id = appUserId
    const user = await supabaseService.getAppUser(appId, appUserId);

    // Check environment for simulation data
    const environment = detectEnvironment(req);
    let billingStatus = user.billing_status;
    let currentPriceId = null;
    let isSimulation = false;
    
    // Check for simulation data in non-production environments
    const cookieName = `sim_billing_${appId}`;
    const simulationCookie = req.cookies[cookieName];
    
    if (environment !== 'production' && simulationCookie) {
      try {
        const simulationData = JSON.parse(simulationCookie);
        // Verify simulation is for current app and user
        if (simulationData.appId === appId && simulationData.appUserId === appUserId) {
          billingStatus = simulationData.status;
          currentPriceId = simulationData.priceId;
          isSimulation = true;
        }
      } catch (e) {
        console.error('Error parsing simulation cookie:', e);
      }
    } else if (billingStatus === 'current') {
      // In production or no simulation, fetch real subscription if billing is current
      const activeSubscription = await supabaseService.getActiveSubscription(appId, appUserId);
      currentPriceId = activeSubscription?.plan_price_id || null;
    }

    // Debug logging for simulation data
    console.log('ME endpoint debug:', {
      timestamp: new Date().toISOString(),
      appId,
      appUserId,
      environment,
      cookieName,
      simulationCookie: simulationCookie ? JSON.parse(simulationCookie) : 'not present',
      billingStatus,
      currentPriceId,
      isSimulation,
      userAgent: req.get('user-agent')?.substring(0, 50)
    });

    // Set cache-control headers to prevent caching of user data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      appId: appId,
      appUserId: appUserId,
      billingStatus: billingStatus,
      displayName: user.display_name,
      email: user.primary_email,
      currentPriceId: currentPriceId,
      isSimulation: isSimulation
    });

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

// Add middleware to create options for all entity routes
router.use('/entities', async (req, res, next) => {

  // get config
  const config = await getAppConfig(req.params.appId, req);

  req.entityOptions = {
    requireLogin: (config.monetization?.type === "open") ? false : true,
    appUserId: req?.auth?.appUserId,
  };
  next();
});

// READ operations
// GET /apps/:appId/entities/:collection - Get all documents
router.get('/entities/:collection', validateAccess, async (req, res) => {

  try {
    const { appId, collection } = req.params;
    const documents = await entityService.getAllDocuments(appId, collection, req.entityOptions);
    
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
    const document = await entityService.getDocumentById(appId, collection, id, req.entityOptions);
    
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
    
    const createdDocument = await entityService.createDocument(appId, collection, documentData, req.entityOptions);
    
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
    
    const results = await entityService.bulkCreateDocuments(appId, collection, documents, req.entityOptions);
    
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
    
    const updatedDocument = await entityService.updateDocument(appId, collection, id, updateData, req.entityOptions);
    
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
    
    const results = await entityService.bulkUpdateDocuments(appId, collection, updates, req.entityOptions);
    
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
    const deletedDocument = await entityService.deleteDocument(appId, collection, id, req.entityOptions);
    
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
    
    const results = await entityService.bulkDeleteDocuments(appId, collection, ids, req.entityOptions);
    
    res.json(bulkResponse(results, appId, collection));
  } catch (error) {
    console.error('Error deleting documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to delete documents'));
  }
});

module.exports = router;