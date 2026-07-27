const cron = require('node-cron');
const logger = require('./logger');

const jobs = [];

// Bookings starting within this window get a one-time reminder email.
const REMINDER_WINDOW_HOURS = 2;

const updateBookingStatusesJob = async () => {
    const Booking = require('../models/Booking');
    try {
        await Booking.updateBookingStatuses();
    } catch (error) {
        logger.error('Scheduled job failed: updateBookingStatuses', { error: error.message });
    }
};

const sendBookingRemindersJob = async () => {
    const Booking = require('../models/Booking');
    const EmailService = require('./email');
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
                await EmailService.sendBookingReminderEmail(booking.user, booking);
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

const registerJob = (name, cronExpression, task) => {
    jobs.push({ name, cronExpression, task: cron.schedule(cronExpression, task) });
};

const init = () => {
    if (process.env.NODE_ENV === 'test') return;

    registerJob('updateBookingStatuses', '*/5 * * * *', updateBookingStatusesJob);
    registerJob('sendBookingReminders', '*/15 * * * *', sendBookingRemindersJob);

    logger.info(`Scheduler initialized with ${jobs.length} job(s)`);
};

const stop = () => {
    jobs.forEach(({ task }) => task.stop());
    jobs.length = 0;
};

module.exports = { init, stop, updateBookingStatusesJob, sendBookingRemindersJob };
