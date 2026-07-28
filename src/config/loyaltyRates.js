// Standalone (no other module deps) so both src/models/User.js and
// src/utils/loyalty.js can import it without creating a require cycle
// between them.
//
// Placeholder defaults - real business rates TBD, tunable via env vars
// without a code change.
module.exports = {
    // Points earned per currency unit spent on a completed booking.
    POINTS_EARN_RATE: parseFloat(process.env.LOYALTY_POINTS_EARN_RATE) || 0.05,
    // Currency value of one point when redeemed into wallet credit.
    POINTS_TO_WALLET_RATE: parseFloat(process.env.LOYALTY_POINTS_TO_WALLET_RATE) || 0.1,
};
