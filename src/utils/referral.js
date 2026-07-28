const crypto = require('crypto');
const User = require('../models/User');
const Referral = require('../models/Referral');
const Booking = require('../models/Booking');
const logger = require('./logger');
const { REFERRER_REWARD, REFERRED_REWARD } = require('../config/referralRewards');

const generateCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// Short random alphanumeric code, retried on collision - mirrors Court.js's
// slug-uniqueness while-loop, but random rather than name-derived since a
// referral code has no source string to slugify.
exports.generateUniqueReferralCode = async () => {
    let code = generateCode();
    while (await User.findOne({ referralCode: code })) {
        code = generateCode();
    }
    return code;
};

// Best-effort, non-blocking - same pattern as awardBookingPoints. Called
// from the same two places a booking's payment first becomes "paid" as
// Phase 5b's awardBookingPoints, as an independent sibling call. No-ops
// unless the paying user was referred, still has a pending referral, and
// this is genuinely their first completed-paid booking.
exports.processReferralQualification = async (booking) => {
    try {
        const referredUser = await User.findById(booking.user);
        if (!referredUser || !referredUser.referredBy) return;

        const referral = await Referral.findOne({ referredUser: referredUser._id, status: 'pending' });
        if (!referral) return;

        const priorPaidBookings = await Booking.countDocuments({
            user: referredUser._id,
            'payment.status': 'completed',
            _id: { $ne: booking._id }
        });
        if (priorPaidBookings > 0) return;

        await User.creditWallet(referral.referrer, REFERRER_REWARD, {
            source: 'referral_bonus',
            description: `Referral bonus for inviting ${referredUser.email}`
        });
        await User.creditWallet(referral.referredUser, REFERRED_REWARD, {
            source: 'referral_bonus',
            description: 'Referral signup bonus'
        });

        referral.status = 'rewarded';
        referral.qualifyingBooking = booking._id;
        referral.referrerReward = REFERRER_REWARD;
        referral.referredReward = REFERRED_REWARD;
        referral.rewardedAt = new Date();
        await referral.save();
    } catch (error) {
        logger.error('Failed to process referral qualification', { bookingId: booking._id, error: error.message });
    }
};
