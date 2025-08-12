const supabaseService = require('../services/supabaseService');

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

async function handlePaymentIntentCreated(paymentIntent, connectedAccountId) {
  const appId = await getAppIdFromStripeAccount(connectedAccountId);
  
  console.log('Payment intent created:', {
    payment_intent_id: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
    connected_account: connectedAccountId,
    app_id: appId
  });

  // TODO: Track payment intent creation for analytics
}

async function handlePaymentIntentSucceeded(paymentIntent, connectedAccountId) {
  const appId = await getAppIdFromStripeAccount(connectedAccountId);
  
  console.log('Payment intent succeeded:', {
    payment_intent_id: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    customer: paymentIntent.customer,
    connected_account: connectedAccountId,
    app_id: appId
  });

  // TODO: Process successful one-time payment, grant access
}

async function handleChargeSucceeded(charge, connectedAccountId) {
  const appId = await getAppIdFromStripeAccount(connectedAccountId);
  
  console.log('Charge succeeded:', {
    charge_id: charge.id,
    amount: charge.amount,
    currency: charge.currency,
    customer: charge.customer,
    payment_intent: charge.payment_intent,
    connected_account: connectedAccountId,
    app_id: appId
  });

  // TODO: Confirm payment completion, send receipts
}

async function handleChargeUpdated(charge, connectedAccountId) {
  const appId = await getAppIdFromStripeAccount(connectedAccountId);
  
  console.log('Charge updated:', {
    charge_id: charge.id,
    amount: charge.amount,
    status: charge.status,
    customer: charge.customer,
    connected_account: connectedAccountId,
    app_id: appId
  });

  // TODO: Handle charge status changes (disputed, refunded, etc.)
}

module.exports = {
  getAppIdFromStripeAccount,
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
};