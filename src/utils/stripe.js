const Stripe = require('stripe');

// Falls back to a dummy key so this module never throws at require-time even
// when STRIPE_SECRET_KEY is unset (e.g. in tests, where the SDK is mocked
// anyway) - mirrors how src/utils/cloudinary.js never throws on missing config.
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

// The only place in the codebase that multiplies by 100: every money field
// elsewhere (Booking.pricing.totalAmount, Court.baseHourlyRate, etc.) is a
// plain major-unit number (e.g. 2100 meaning PKR 2100); Stripe wants an
// integer minor-unit amount.
const toMinorUnits = (amount) => Math.round(amount * 100);

const createPaymentIntent = async ({ amount, currency, metadata }) => {
    return stripe.paymentIntents.create({
        amount: toMinorUnits(amount),
        currency: (currency || 'PKR').toLowerCase(),
        metadata,
    });
};

const retrievePaymentIntent = async (paymentIntentId) => {
    return stripe.paymentIntents.retrieve(paymentIntentId);
};

// `reason`, if given, must be one of Stripe's own enum values
// ('duplicate' | 'fraudulent' | 'requested_by_customer') - it is NOT a
// free-text field. Store any human-readable cancellation reason separately
// (e.g. on the Payment/Booking record), not here.
const createRefund = async ({ paymentIntentId, amount, reason }) => {
    const params = { payment_intent: paymentIntentId };
    if (amount !== undefined) params.amount = toMinorUnits(amount);
    if (reason) params.reason = reason;
    return stripe.refunds.create(params);
};

const constructWebhookEvent = (rawBody, signature) => {
    return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
};

module.exports = {
    createPaymentIntent,
    retrievePaymentIntent,
    createRefund,
    constructWebhookEvent,
};
