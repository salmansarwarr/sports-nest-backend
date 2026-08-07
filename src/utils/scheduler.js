const cron = require('node-cron');
const mongoose = require('mongoose');
const logger = require('./logger');

const jobs = [];

// Bookings starting within this window get a one-time reminder email.
const REMINDER_WINDOW_HOURS = 2;

// Skip a run entirely while Mongo is down/reconnecting rather than letting
// queries sit in the (now unbuffered) driver and reject after a timeout.
const isDbConnected = () => mongoose.connection.readyState === 1;

const updateBookingStatusesJob = async () => {
    if (!isDbConnected()) {
        logger.warn('Skipping updateBookingStatuses: database not connected');
        return;
    }
    const Booking = require('../models/Booking');
    try {
        await Booking.updateBookingStatuses();
    } catch (error) {
        logger.error('Scheduled job failed: updateBookingStatuses', { error: error.message });
    }
};

const sendBookingRemindersJob = async () => {
    if (!isDbConnected()) {
        logger.warn('Skipping sendBookingReminders: database not connected');
        return;
    }
    const Booking = require('../models/Booking');
    const notify = require('./notify');
    try {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

        const bookings = await Booking.find({
            status: 'confirmed',
            startTime: { $gte: now, $lte: windowEnd },
            reminderSent: false,
        }).populate('user');

        for (const booking of bookings) {
            try {
                await notify.bookingReminder(booking.user, booking);
                booking.reminderSent = true;
                await booking.save();
            } catch (error) {
                logger.error('Failed to send booking reminder', { bookingId: booking._id, error: error.message });
            }
        }
    } catch (error) {
        logger.error('Scheduled job failed: sendBookingReminders', { error: error.message });
    }
};

/**
 * Fallback sweep for waitlist promotions. The primary path is inline (from
 * cancelBooking/rejectBooking), but updateBookingStatuses can free a slot via
 * no-show/expired without going through either of those, so this catches
 * that case. Safe to be redundant with the inline path - settleWaitlist
 * re-derives live state from the DB every call rather than relying on a
 * flag, and its promoting update is guarded by an atomic status:'waitlisted'
 * filter.
 */
const sweepWaitlistPromotionsJob = async () => {
    if (!isDbConnected()) {
        logger.warn('Skipping sweepWaitlistPromotions: database not connected');
        return;
    }
    const Booking = require('../models/Booking');
    const notify = require('./notify');
    try {
        const slots = await Booking.aggregate([
            { $match: { status: 'waitlisted' } },
            { $group: { _id: { court: '$court', startTime: '$startTime', endTime: '$endTime' } } },
        ]);

        for (const { _id: slot } of slots) {
            try {
                const promoted = await Booking.settleWaitlist(slot.court, slot.startTime, slot.endTime);
                if (promoted) {
                    await notify.waitlistPromoted(promoted.user, promoted);
                }
            } catch (error) {
                logger.error('Failed to settle waitlist during sweep', { slot, error: error.message });
            }
        }
    } catch (error) {
        logger.error('Scheduled job failed: sweepWaitlistPromotions', { error: error.message });
    }
};

const registerJob = (name, cronExpression, task) => {
    jobs.push({ name, cronExpression, task: cron.schedule(cronExpression, task) });
};

const init = () => {
    if (process.env.NODE_ENV === 'test') return;

    registerJob('updateBookingStatuses', '*/5 * * * *', updateBookingStatusesJob);
    registerJob('sendBookingReminders', '*/15 * * * *', sendBookingRemindersJob);
    registerJob('sweepWaitlistPromotions', '*/10 * * * *', sweepWaitlistPromotionsJob);

    logger.info(`Scheduler initialized with ${jobs.length} job(s)`);
};

const stop = () => {
    jobs.forEach(({ task }) => task.stop());
    jobs.length = 0;
};

module.exports = { init, stop, updateBookingStatusesJob, sendBookingRemindersJob, sweepWaitlistPromotionsJob };
