const { body, param, query } = require('express-validator');

// Create Booking Validation
exports.createBookingValidation = [
    body('court')
        .notEmpty().withMessage('Court is required')
        .isMongoId().withMessage('Invalid court ID'),

    body('startTime')
        .notEmpty().withMessage('Start time is required')
        .isISO8601().withMessage('Valid start time is required')
        .custom((value) => {
            const startTime = new Date(value);
            const now = new Date();
            if (startTime <= now) {
                throw new Error('Start time must be in the future');
            }
            return true;
        }),

    body('endTime')
        .notEmpty().withMessage('End time is required')
        .isISO8601().withMessage('Valid end time is required')
        .custom((value, { req }) => {
            const startTime = new Date(req.body.startTime);
            const endTime = new Date(value);
            if (endTime <= startTime) {
                throw new Error('End time must be after start time');
            }
            return true;
        }),

    body('bookingType')
        .optional()
        .isIn(['single', 'recurring']).withMessage('Invalid booking type'),

    body('recurringPattern.frequency')
        .if(body('bookingType').equals('recurring'))
        .notEmpty().withMessage('Frequency is required for recurring bookings')
        .isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid frequency'),

    body('recurringPattern.interval')
        .optional()
        .isInt({ min: 1 }).withMessage('Interval must be at least 1'),

    body('recurringPattern.daysOfWeek')
        .optional()
        .isArray().withMessage('Days of week must be an array'),

    body('recurringPattern.daysOfWeek.*')
        .optional()
        .isInt({ min: 0, max: 6 }).withMessage('Day of week must be between 0 and 6'),

    body('recurringPattern.endDate')
        .if(body('bookingType').equals('recurring'))
        .optional()
        .isISO8601().withMessage('Valid end date is required'),

    body('recurringPattern.occurrences')
        .if(body('bookingType').equals('recurring'))
        .optional()
        .isInt({ min: 1, max: 52 }).withMessage('Occurrences must be between 1 and 52'),

    body('groupSize')
        .optional()
        .isInt({ min: 1 }).withMessage('Group size must be at least 1'),

    body('isGroupBooking')
        .optional()
        .isBoolean(),

    body('participants')
        .optional()
        .isArray().withMessage('Participants must be an array'),

    body('notes')
        .optional()
        .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters'),

    body('specialRequests')
        .optional()
        .isLength({ max: 500 }).withMessage('Special requests cannot exceed 500 characters'),

    body('contactInfo.name')
        .optional()
        .isString(),

    body('contactInfo.email')
        .optional()
        .isEmail().withMessage('Valid email is required')
        .normalizeEmail(),

    body('contactInfo.phone')
        .optional()
        .isString(),
];

// Update Booking Validation
exports.updateBookingValidation = [
    body('startTime')
        .optional()
        .isISO8601().withMessage('Valid start time is required')
        .custom((value) => {
            const startTime = new Date(value);
            const now = new Date();
            if (startTime <= now) {
                throw new Error('Start time must be in the future');
            }
            return true;
        }),

    body('endTime')
        .optional()
        .isISO8601().withMessage('Valid end time is required')
        .custom((value, { req }) => {
            if (req.body.startTime) {
                const startTime = new Date(req.body.startTime);
                const endTime = new Date(value);
                if (endTime <= startTime) {
                    throw new Error('End time must be after start time');
                }
            }
            return true;
        }),

    body('notes')
        .optional()
        .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters'),

    body('specialRequests')
        .optional()
        .isLength({ max: 500 }).withMessage('Special requests cannot exceed 500 characters'),

    body('groupSize')
        .optional()
        .isInt({ min: 1 }).withMessage('Group size must be at least 1'),

    body('modificationReason')
        .optional()
        .isString(),
];

// Cancel Booking Validation
exports.cancelBookingValidation = [
    body('reason')
        .notEmpty().withMessage('Cancellation reason is required')
        .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters'),
];

// Check Availability Validation
exports.checkAvailabilityValidation = [
    body('court')
        .notEmpty().withMessage('Court is required')
        .isMongoId().withMessage('Invalid court ID'),

    body('startTime')
        .notEmpty().withMessage('Start time is required')
        .isISO8601().withMessage('Valid start time is required'),

    body('endTime')
        .notEmpty().withMessage('End time is required')
        .isISO8601().withMessage('Valid end time is required')
        .custom((value, { req }) => {
            const startTime = new Date(req.body.startTime);
            const endTime = new Date(value);
            if (endTime <= startTime) {
                throw new Error('End time must be after start time');
            }
            return true;
        }),
];

// Get Available Slots Validation
exports.getAvailableSlotsValidation = [
    param('courtId')
        .isMongoId().withMessage('Invalid court ID'),

    query('date')
        .notEmpty().withMessage('Date is required')
        .isISO8601().withMessage('Valid date is required'),

    query('interval')
        .optional()
        .isInt({ min: 15, max: 180 }).withMessage('Interval must be between 15 and 180 minutes'),
];

// Approve/Reject Booking Validation
exports.rejectBookingValidation = [
    body('reason')
        .notEmpty().withMessage('Rejection reason is required')
        .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters'),
];

// Add Participant Validation
exports.addParticipantValidation = [
    body('name')
        .optional()
        .isString(),

    body('email')
        .optional()
        .isEmail().withMessage('Valid email is required')
        .normalizeEmail(),

    body('phone')
        .optional()
        .isString(),

    body('user')
        .optional()
        .isMongoId().withMessage('Invalid user ID'),

    body('paymentShare')
        .optional()
        .isFloat({ min: 0 }).withMessage('Payment share must be a positive number'),
];

// Query Parameters Validation
exports.getBookingsQueryValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

    query('status')
        .optional()
        .isIn([
            'pending-confirmation',
            'confirmed',
            'in-progress',
            'completed',
            'cancelled',
            'no-show',
            'expired'
        ]).withMessage('Invalid status'),

    query('court')
        .optional()
        .isMongoId().withMessage('Invalid court ID'),

    query('venue')
        .optional()
        .isMongoId().withMessage('Invalid venue ID'),

    query('user')
        .optional()
        .isMongoId().withMessage('Invalid user ID'),

    query('bookingType')
        .optional()
        .isIn(['single', 'recurring']).withMessage('Invalid booking type'),

    query('isPaid')
        .optional()
        .isBoolean().withMessage('isPaid must be a boolean'),

    query('startDate')
        .optional()
        .isISO8601().withMessage('Valid start date is required'),

    query('endDate')
        .optional()
        .isISO8601().withMessage('Valid end date is required'),
];

// MongoDB ID Validation
exports.mongoIdValidation = [
    param('id')
        .isMongoId().withMessage('Invalid booking ID'),
];

module.exports = exports;