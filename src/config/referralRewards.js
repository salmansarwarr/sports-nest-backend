// Placeholder defaults - real business amounts TBD, tunable via env vars
// without a code change. Standalone (no other module deps), same reasoning
// as src/config/loyaltyRates.js.
module.exports = {
    REFERRER_REWARD: parseFloat(process.env.REFERRAL_REFERRER_REWARD) || 500,
    REFERRED_REWARD: parseFloat(process.env.REFERRAL_REFERRED_REWARD) || 250,
};
