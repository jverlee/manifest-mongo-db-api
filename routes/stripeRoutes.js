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



module.exports = router;
module.exports.webhookHandler = webhookHandler;