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
  // Get app ID and user ID from session metadata
  const appId = session.metadata?.manifest_app_id;
  const appUserId = session.metadata?.manifest_app_user_id;
  
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
    app_id: appId,
    app_user_id: appUserId
  });

  // TODO: Save customer and payment data to database
  // This is where you'd create/update user subscription status
}

async function handleSubscriptionCreated(subscription, connectedAccountId) {
  // Get app ID and user ID from subscription metadata (required)
  const appId = subscription.metadata?.manifest_app_id;
  const appUserId = subscription.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in subscription metadata:', subscription.id);
    return;
  }
  
  // Get period dates from the first subscription item
  const firstItem = subscription.items?.data?.[0];
  
  // Prepare data for app_user_subscriptions table
  const subscriptionData = {
    stripe_account_id: connectedAccountId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer,
    plan_price_id: subscription.items.data[0]?.price.id, // Primary price ID
    status: subscription.status,
    current_period_start: firstItem?.current_period_start ? new Date(firstItem.current_period_start * 1000) : null,
    current_period_end: firstItem?.current_period_end ? new Date(firstItem.current_period_end * 1000) : null,
    cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    app_id: appId,
    app_user_id: appUserId
  };

  console.log('📝 DATA TO INSERT - app_user_subscriptions:');
  console.log(JSON.stringify(subscriptionData, null, 2));

  // TODO: Insert into app_user_subscriptions table
}

async function handleSubscriptionUpdated(subscription, connectedAccountId) {
  // Get app ID and user ID from subscription metadata (required)
  const appId = subscription.metadata?.manifest_app_id;
  const appUserId = subscription.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in subscription metadata:', subscription.id);
    return;
  }
  
  // Get period dates from the first subscription item
  const firstItem = subscription.items?.data?.[0];
  
  // Prepare data for app_user_subscriptions table update
  const subscriptionUpdateData = {
    stripe_subscription_id: subscription.id, // WHERE condition
    stripe_customer_id: subscription.customer,
    plan_price_id: subscription.items.data[0]?.price.id,
    status: subscription.status,
    current_period_start: firstItem?.current_period_start ? new Date(firstItem.current_period_start * 1000) : null,
    current_period_end: firstItem?.current_period_end ? new Date(firstItem.current_period_end * 1000) : null,
    cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
  };

  console.log('📝 DATA TO UPDATE - app_user_subscriptions (WHERE stripe_subscription_id = ${subscriptionUpdateData.stripe_subscription_id}):');
  console.log(JSON.stringify(subscriptionUpdateData, null, 2));
  console.log('Previous attributes:', subscription.previous_attributes);

  // TODO: Update app_user_subscriptions table
}

async function handleSubscriptionDeleted(subscription, connectedAccountId) {
  // Get app ID and user ID from subscription metadata (required)
  const appId = subscription.metadata?.manifest_app_id;
  const appUserId = subscription.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in subscription metadata:', subscription.id);
    return;
  }
  
  // Prepare data for app_user_subscriptions table update (mark as deleted/canceled)
  const subscriptionDeleteData = {
    stripe_subscription_id: subscription.id, // WHERE condition
    status: 'canceled', // Final status
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date()
  };

  console.log('📝 DATA TO UPDATE - app_user_subscriptions (DELETE EVENT - WHERE stripe_subscription_id = ${subscriptionDeleteData.stripe_subscription_id}):');
  console.log(JSON.stringify(subscriptionDeleteData, null, 2));

  // TODO: Update app_user_subscriptions table status to canceled
}

async function handleInvoicePaymentSucceeded(invoice, connectedAccountId) {
  // Get app ID and user ID from invoice metadata (required)
  const appId = invoice.metadata?.manifest_app_id;
  const appUserId = invoice.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in invoice metadata:', invoice.id);
    return;
  }
  
  console.log('Invoice payment succeeded:', {
    invoice_id: invoice.id,
    customer_id: invoice.customer,
    subscription_id: invoice.subscription,
    amount_paid: invoice.amount_paid,
    currency: invoice.currency,
    period_start: new Date(invoice.period_start * 1000),
    period_end: new Date(invoice.period_end * 1000),
    connected_account: connectedAccountId,
    app_id: appId,
    app_user_id: appUserId
  });

  // TODO: Extend subscription period, send receipt
}

async function handleInvoicePaymentFailed(invoice, connectedAccountId) {
  // Get app ID and user ID from invoice metadata (required)
  const appId = invoice.metadata?.manifest_app_id;
  const appUserId = invoice.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in invoice metadata:', invoice.id);
    return;
  }
  
  console.log('Invoice payment failed:', {
    invoice_id: invoice.id,
    customer_id: invoice.customer,
    subscription_id: invoice.subscription,
    amount_due: invoice.amount_due,
    attempt_count: invoice.attempt_count,
    connected_account: connectedAccountId,
    app_id: appId,
    app_user_id: appUserId
  });

  // TODO: Notify user of failed payment, potentially suspend access
}

async function handlePaymentIntentCreated(paymentIntent, connectedAccountId) {
  // Get app ID and user ID from payment intent metadata (required)
  const appId = paymentIntent.metadata?.manifest_app_id;
  const appUserId = paymentIntent.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in payment intent metadata:', paymentIntent.id);
    return;
  }
  
  console.log('Payment intent created:', {
    payment_intent_id: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
    connected_account: connectedAccountId,
    app_id: appId,
    app_user_id: appUserId
  });

  // TODO: Track payment intent creation for analytics
}

async function handlePaymentIntentSucceeded(paymentIntent, connectedAccountId) {
  // Get app ID and user ID from payment intent metadata (required)
  const appId = paymentIntent.metadata?.manifest_app_id;
  const appUserId = paymentIntent.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in payment intent metadata:', paymentIntent.id);
    return;
  }
  
  // Prepare data for app_user_payments table
  const paymentData = {
    stripe_account_id: connectedAccountId,
    stripe_payment_intent_id: paymentIntent.id,
    stripe_customer_id: paymentIntent.customer,
    stripe_subscription_id: null, // Will be set if this is part of subscription
    amount: paymentIntent.amount,
    currency: paymentIntent.currency.toLowerCase(),
    status: 'succeeded',
    refunded: false,
    refunded_amount: 0,
    paid_at: new Date(), // Current timestamp when succeeded
    app_id: appId,
    app_user_id: appUserId
  };

  console.log('💳 RAW STRIPE PAYMENT INTENT OBJECT:');
  console.log(JSON.stringify(paymentIntent, null, 2));
  console.log('💳 DATA TO INSERT - app_user_payments:');
  console.log(JSON.stringify(paymentData, null, 2));

  // TODO: Insert into app_user_payments table
}

async function handleChargeSucceeded(charge, connectedAccountId) {
  // Get app ID and user ID from charge metadata (required)
  const appId = charge.metadata?.manifest_app_id;
  const appUserId = charge.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in charge metadata:', charge.id);
    return;
  }
  
  console.log('💳 CHARGE SUCCEEDED - Updating payment record for payment_intent:', charge.payment_intent);
  
  // This event is used to update the payment record created by payment_intent.succeeded
  // We mainly use this to confirm the charge was successful and update paid_at if needed
  const chargeData = {
    stripe_payment_intent_id: charge.payment_intent, // WHERE condition
    paid_at: new Date(charge.created * 1000), // Actual charge timestamp
    status: 'succeeded'
  };

  console.log('💳 DATA TO UPDATE - app_user_payments (WHERE stripe_payment_intent_id = ${chargeData.stripe_payment_intent_id}):');
  console.log(JSON.stringify(chargeData, null, 2));

  // TODO: Update app_user_payments table with charge details
}

async function handleChargeUpdated(charge, connectedAccountId) {
  // Get app ID and user ID from charge metadata (required)
  const appId = charge.metadata?.manifest_app_id;
  const appUserId = charge.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in charge metadata:', charge.id);
    return;
  }
  
  console.log('Charge updated:', {
    charge_id: charge.id,
    amount: charge.amount,
    status: charge.status,
    customer: charge.customer,
    connected_account: connectedAccountId,
    app_id: appId,
    app_user_id: appUserId
  });

  // TODO: Handle charge status changes (disputed, refunded, etc.)
}

async function handleSubscriptionTrialWillEnd(subscription, connectedAccountId) {
  // Get app ID and user ID from subscription metadata (required)
  const appId = subscription.metadata?.manifest_app_id;
  const appUserId = subscription.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in subscription metadata:', subscription.id);
    return;
  }
  
  console.log('Subscription trial will end:', {
    subscription_id: subscription.id,
    customer_id: subscription.customer,
    trial_end: new Date(subscription.trial_end * 1000),
    status: subscription.status,
    connected_account: connectedAccountId,
    app_id: appId,
    app_user_id: appUserId
  });

  // TODO: Notify user about trial ending
}

async function handlePaymentIntentPaymentFailed(paymentIntent, connectedAccountId) {
  // Get app ID and user ID from payment intent metadata (required)
  const appId = paymentIntent.metadata?.manifest_app_id;
  const appUserId = paymentIntent.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in payment intent metadata:', paymentIntent.id);
    return;
  }
  
  // Prepare data for app_user_payments table (failed payment)
  const paymentData = {
    stripe_account_id: connectedAccountId,
    stripe_payment_intent_id: paymentIntent.id,
    stripe_customer_id: paymentIntent.customer,
    stripe_subscription_id: null,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency.toLowerCase(),
    status: 'failed',
    refunded: false,
    refunded_amount: 0,
    paid_at: null, // No payment date for failed payments
    app_id: appId,
    app_user_id: appUserId
  };

  console.log('❌ DATA TO INSERT - app_user_payments (FAILED):');
  console.log(JSON.stringify(paymentData, null, 2));
  console.log('Failure reason:', paymentIntent.last_payment_error);

  // TODO: Insert into app_user_payments table
}

async function handleChargeDisputeCreated(dispute, connectedAccountId) {
  // Get app ID from charge metadata (required)
  const appId = dispute.charge?.metadata?.manifest_app_id;
  const appUserId = dispute.charge?.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in dispute charge metadata:', dispute.id);
    return;
  }
  
  console.log('Charge dispute created:', {
    dispute_id: dispute.id,
    charge_id: dispute.charge,
    amount: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    status: dispute.status,
    connected_account: connectedAccountId,
    app_id: appId,
    app_user_id: appUserId
  });

  // TODO: Handle dispute created
}

async function handleChargeRefunded(charge, connectedAccountId) {
  // Get app ID and user ID from charge metadata (required)
  const appId = charge.metadata?.manifest_app_id;
  const appUserId = charge.metadata?.manifest_app_user_id;
  
  if (!appId) {
    console.error('❌ Missing manifest_app_id in charge metadata:', charge.id);
    return;
  }
  
  // Prepare data for app_user_payments table update (refund)
  const refundData = {
    stripe_payment_intent_id: charge.payment_intent, // WHERE condition
    refunded: charge.refunded, // true if fully refunded
    refunded_amount: charge.amount_refunded,
    status: charge.refunded ? 'refunded' : 'partially_refunded'
  };

  console.log('🔄 DATA TO UPDATE - app_user_payments (REFUND - WHERE stripe_payment_intent_id = ${refundData.stripe_payment_intent_id}):');
  console.log(JSON.stringify(refundData, null, 2));

  // TODO: Update app_user_payments table with refund details
}

module.exports = {
  getAppIdFromStripeAccount,
  handleCheckoutCompleted,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleSubscriptionTrialWillEnd,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
  handlePaymentIntentSucceeded,
  handlePaymentIntentPaymentFailed,
  handleChargeSucceeded,
  handleChargeRefunded,
  handleChargeDisputeCreated
};