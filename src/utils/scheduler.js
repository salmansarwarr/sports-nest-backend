const cron = require('node-cron');
const logger = require('./logger');

const jobs = [];

const updateBookingStatusesJob = async () => {
    const Booking = require('../models/Booking');
    try {
        await Booking.updateBookingStatuses();
    } catch (error) {
        logger.error('Scheduled job failed: updateBookingStatuses', { error: error.message });
    }
};

const registerJob = (name, cronExpression, task) => {
    jobs.push({ name, cronExpression, task: cron.schedule(cronExpression, task) });
};

const init = () => {
    if (process.env.NODE_ENV === 'test') return;

    registerJob('updateBookingStatuses', '*/5 * * * *', updateBookingStatusesJob);

    logger.info(`Scheduler initialized with ${jobs.length} job(s)`);
};

const stop = () => {
    jobs.forEach(({ task }) => task.stop());
    jobs.length = 0;
};

module.exports = { init, stop, updateBookingStatusesJob };
