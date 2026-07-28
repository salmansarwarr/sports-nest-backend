const EmailService = require('./email');
const { sendPushNotification } = require('./push');
const { sendWhatsAppMessage } = require('./whatsapp');
const logger = require('./logger');

// Fires all three channels for a user, independently gated by their
// notification preferences and independently try/caught so one channel
// failing never blocks the others.
const dispatch = async (user, { email, pushTitle, pushBody, whatsappBody }) => {
    const prefs = user?.preferences?.notifications || {};

    if (prefs.email !== false && email) {
        try {
            await email();
        } catch (error) {
            logger.error('Failed to send notification email', { userId: user?._id, error: error.message });
        }
    }

    if (prefs.push && user?.deviceTokens?.length) {
        try {
            await sendPushNotification(user.deviceTokens.map((dt) => dt.token), { title: pushTitle, body: pushBody });
        } catch (error) {
            logger.error('Failed to send push notification', { userId: user?._id, error: error.message });
        }
    }

    if (prefs.whatsapp && user?.phone) {
        try {
            await sendWhatsAppMessage(user.phone, whatsappBody);
        } catch (error) {
            logger.error('Failed to send WhatsApp notification', { userId: user?._id, error: error.message });
        }
    }
};

exports.bookingConfirmed = (user, booking) => dispatch(user, {
    email: () => EmailService.sendBookingConfirmationEmail(user, booking),
    pushTitle: 'Booking Confirmed',
    pushBody: `Your booking ${booking.bookingNumber} is confirmed.`,
    whatsappBody: `Your booking ${booking.bookingNumber} is confirmed.`,
});

exports.bookingCancelled = (user, booking, reason) => dispatch(user, {
    email: () => EmailService.sendBookingCancellationEmail(user, booking, reason),
    pushTitle: 'Booking Cancelled',
    pushBody: `Your booking ${booking.bookingNumber} was cancelled.`,
    whatsappBody: `Your booking ${booking.bookingNumber} was cancelled.${reason ? ` Reason: ${reason}` : ''}`,
});

exports.bookingReminder = (user, booking) => dispatch(user, {
    email: () => EmailService.sendBookingReminderEmail(user, booking),
    pushTitle: 'Upcoming Booking',
    pushBody: `Your booking ${booking.bookingNumber} starts soon.`,
    whatsappBody: `Reminder: your booking ${booking.bookingNumber} starts soon.`,
});

exports.waitlistPromoted = (user, booking) => dispatch(user, {
    email: () => EmailService.sendBookingConfirmationEmail(user, booking),
    pushTitle: 'Waitlist Update',
    pushBody: `A spot opened up! Your booking ${booking.bookingNumber} is now confirmed.`,
    whatsappBody: `Good news! A spot opened up and your booking ${booking.bookingNumber} is now confirmed.`,
});

// Guests (a participant with no linked User doc) only ever get email - there
// are no preferences/device tokens/phone to gate a push or WhatsApp send on.
exports.participantInvited = async (participant, booking) => {
    if (!participant.user) {
        try {
            await EmailService.sendParticipantInviteEmail(
                { email: participant.email, name: participant.name || 'there' },
                booking
            );
        } catch (error) {
            logger.error('Failed to send participant invite email', { error: error.message });
        }
        return;
    }

    const User = require('../models/User');
    const user = await User.findById(participant.user);
    if (!user) return;

    await dispatch(user, {
        email: () => EmailService.sendParticipantInviteEmail({ email: user.email, name: user.firstName }, booking),
        pushTitle: 'Booking Invitation',
        pushBody: `You've been invited to a booking (${booking.bookingNumber}).`,
        whatsappBody: `You've been invited to a booking (${booking.bookingNumber}).`,
    });
};
