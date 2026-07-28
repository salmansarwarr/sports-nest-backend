const twilio = require('twilio');

// Mirrors src/utils/stripe.js's fallback pattern - twilio's constructor is
// safe to call with dummy credentials at require-time (no network call).
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID || 'AC_dummy',
    process.env.TWILIO_AUTH_TOKEN || 'dummy_token'
);

// Sends over Twilio's WhatsApp channel (not carrier SMS) - both `from` and
// `to` need the `whatsapp:` prefix per Twilio's API.
const sendWhatsAppMessage = async (to, body) => {
    if (!process.env.TWILIO_ACCOUNT_SID || !to) {
        return null;
    }

    return client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${to}`,
        body,
    });
};

module.exports = { sendWhatsAppMessage };
