const { query } = require('express-validator');

exports.getRevenueValidation = [
    query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date is required'),
    query('groupBy').optional().isIn(['day', 'week', 'month']).withMessage('groupBy must be day, week, or month'),
    query('court').optional().isMongoId().withMessage('Invalid court ID'),
    query('venue').optional().isMongoId().withMessage('Invalid venue ID'),
];

exports.getOccupancyValidation = [
    query('startDate').notEmpty().withMessage('startDate is required').isISO8601().withMessage('Valid start date is required'),
    query('endDate').notEmpty().withMessage('endDate is required').isISO8601().withMessage('Valid end date is required'),
    query('court').optional().isMongoId().withMessage('Invalid court ID'),
];

exports.getPopularCourtsValidation = [
    query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date is required'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
];

exports.getBookingsSummaryValidation = [
    query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date is required'),
];
