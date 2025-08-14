# Manifest End User App API

The API server for apps users create.

# Stripe

## Stripe Testing

### Stripe Testing: To Login
stripe login

IMPORTANT NOTE: Log into the PLATFORM account, NOT the connected accounts. When you trigger an action, you'll specify what connected account you want it to run on. However you must be logged into the platform account so that it properly simulates the platform listening for events from across ALL connected accounts.

### Stripe Testing: To Listen
stripe listen --forward-connect-to localhost:3500/stripe/webhook
This will output a unique STRIPE_WEBHOOK_SECRET that will be needed in .env

(note that --forward-connect-to is different than --connect-to - this is used for connect accounts)

### Stripe Testing: To Send

#### For payment intents
stripe trigger payment_intent.succeeded \
--add "payment_intent:metadata[manifest_app_id]=d7ba5756-d920-41f9-9c69-dd4c916c9fb2" \
--add "payment_intent:metadata[manifest_app_user_id]=3af93de6-6c8a-43ef-b690-5775243e9918" \
--stripe-account acct_1Rv24TLuxP6zixJG