# Manifest End User App API

The API server for apps users create.

# Stripe

## Testing

### To Listen
stripe listen --forward-to localhost:3500/stripe/webhook

### To Send
stripe trigger payment_intent.succeeded