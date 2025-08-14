const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CLIENT_SECRET);
const supabaseService = require('../services/supabaseService');
const { errorResponse } = require('../utils/responseUtils');
const {
  handleCheckoutCompleted,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleSubscriptionTrialWillEnd,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
  handlePaymentIntentCreated,
  handlePaymentIntentSucceeded,
  handlePaymentIntentPaymentFailed,
  handleChargeSucceeded,
  handleChargeRefunded,
  handleChargeDisputeCreated
} = require('../utils/stripeHelpers');

// =============================================================================
// STRIPE WEBHOOK ROUTE
// =============================================================================

// Webhook handler function (exported separately for server.js to use with raw body parsing)
const webhookHandler = async (req, res) => {
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
    console.log(`✅ Webhook: ${event.type} [${event.id}]`);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // For Connect accounts, the event will have an 'account' property
  const connectedAccountId = event.account;

  try {
    switch (event.type) {
      // Subscription events (for app_user_subscriptions table)
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object, connectedAccountId);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object, connectedAccountId);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, connectedAccountId);
        break;

      case 'customer.subscription.trial_will_end':
        await handleSubscriptionTrialWillEnd(event.data.object, connectedAccountId);
        break;

      // Payment events (for app_user_payments table)
      case 'payment_intent.created':
        await handlePaymentIntentCreated(event.data.object, connectedAccountId);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object, connectedAccountId);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentPaymentFailed(event.data.object, connectedAccountId);
        break;

      case 'charge.succeeded':
        await handleChargeSucceeded(event.data.object, connectedAccountId);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object, connectedAccountId);
        break;

      case 'charge.dispute.created':
        await handleChargeDisputeCreated(event.data.object, connectedAccountId);
        break;

      // Invoice events (for payment tracking)
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
};

// Also expose as a route for consistency
router.post('/webhook', webhookHandler);

// =============================================================================
// STRIPE REDIRECT ROUTES
// =============================================================================

// GET /stripe/success - Handle successful payment
router.get('/success', async (req, res) => {
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
router.get('/cancel', async (req, res) => {
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

module.exports = router;
module.exports.webhookHandler = webhookHandler;