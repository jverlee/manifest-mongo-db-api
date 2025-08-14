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
--add "payment_intent:metadata[manifest_app_user_id]=901d51e2-861a-4c8d-8543-0d97b0552708" \
--stripe-account acct_1Rv24TLuxP6zixJG

#### For failed payment intents
stripe trigger payment_intent.payment_failed \
--add "payment_intent:metadata[manifest_app_id]=d7ba5756-d920-41f9-9c69-dd4c916c9fb2" \
--add "payment_intent:metadata[manifest_app_user_id]=901d51e2-861a-4c8d-8543-0d97b0552708" \
--stripe-account acct_1Rv24TLuxP6zixJG

#### For subscription events
stripe trigger customer.subscription.created \
--add "subscription:metadata[manifest_app_id]=d7ba5756-d920-41f9-9c69-dd4c916c9fb2" \
--add "subscription:metadata[manifest_app_user_id]=901d51e2-861a-4c8d-8543-0d97b0552708" \
--stripe-account acct_1Rv24TLuxP6zixJG

stripe trigger customer.subscription.updated \
--add "subscription:metadata[manifest_app_id]=d7ba5756-d920-41f9-9c69-dd4c916c9fb2" \
--add "subscription:metadata[manifest_app_user_id]=901d51e2-861a-4c8d-8543-0d97b0552708" \
--stripe-account acct_1Rv24TLuxP6zixJG

stripe trigger customer.subscription.deleted \
--add "subscription:metadata[manifest_app_id]=d7ba5756-d920-41f9-9c69-dd4c916c9fb2" \
--add "subscription:metadata[manifest_app_user_id]=901d51e2-861a-4c8d-8543-0d97b0552708" \
--stripe-account acct_1Rv24TLuxP6zixJG

stripe trigger customer.subscription.trial_will_end \
--add "subscription:metadata[manifest_app_id]=d7ba5756-d920-41f9-9c69-dd4c916c9fb2" \
--add "subscription:metadata[manifest_app_user_id]=901d51e2-861a-4c8d-8543-0d97b0552708" \
--stripe-account acct_1Rv24TLuxP6zixJG

#### For invoice events
stripe trigger invoice.payment_succeeded \
--add "invoice:metadata[manifest_app_id]=d7ba5756-d920-41f9-9c69-dd4c916c9fb2" \
--add "invoice:metadata[manifest_app_user_id]=901d51e2-861a-4c8d-8543-0d97b0552708" \
--stripe-account acct_1Rv24TLuxP6zixJG

stripe trigger invoice.payment_failed \
--add "invoice:metadata[manifest_app_id]=d7ba5756-d920-41f9-9c69-dd4c916c9fb2" \
--add "invoice:metadata[manifest_app_user_id]=901d51e2-861a-4c8d-8543-0d97b0552708" \
--stripe-account acct_1Rv24TLuxP6zixJG

#### For dispute events
stripe trigger charge.dispute.created \
--add "dispute:charge:metadata[manifest_app_id]=d7ba5756-d920-41f9-9c69-dd4c916c9fb2" \
--add "dispute:charge:metadata[manifest_app_user_id]=901d51e2-861a-4c8d-8543-0d97b0552708" \
--stripe-account acct_1Rv24TLuxP6zixJG