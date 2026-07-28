const { body, param, query } = require('express-validator');

exports.createPaymentIntentValidation = [
    body('bookingId')
        .notEmpty().withMessage('Booking ID is required')
        .isMongoId().withMessage('Invalid booking ID'),
];

exports.getPaymentHistoryQueryValidation = [
    query('status').optional().isIn(['pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially-refunded', 'cancelled']).withMessage('Invalid status'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

exports.mongoIdValidation = [
    param('id').isMongoId().withMessage('Invalid payment ID'),
];
