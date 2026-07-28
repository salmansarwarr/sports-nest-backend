const User = require('../models/User');
const logger = require('./logger');
const { POINTS_EARN_RATE, POINTS_TO_WALLET_RATE } = require('../config/loyaltyRates');

exports.POINTS_EARN_RATE = POINTS_EARN_RATE;
exports.POINTS_TO_WALLET_RATE = POINTS_TO_WALLET_RATE;

// Best-effort, non-blocking - same pattern as auditLog.record/notify.js.
// Called from the two places a booking's payment first becomes "paid"
// (Stripe webhook success, or full wallet coverage at booking-creation
// time), which are mutually exclusive per booking, so this never
// double-awards for a single booking's initial payment.
exports.awardBookingPoints = async (booking) => {
    try {
        const points = Math.floor(booking.pricing.totalAmount * POINTS_EARN_RATE);
        if (points > 0) {
            await User.earnLoyaltyPoints(booking.user, points, {
                source: 'booking_completed',
                booking: booking._id,
                description: `Points earned for booking ${booking.bookingNumber}`
            });
        }
    } catch (error) {
        logger.error('Failed to award loyalty points', { bookingId: booking._id, error: error.message });
    }
};
