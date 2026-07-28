const { body, query } = require('express-validator');

exports.getTransactionsQueryValidation = [
    query('type').optional().isIn(['earn', 'redeem', 'admin_adjustment']).withMessage('Invalid type'),
    query('source').optional().isIn(['booking_completed', 'redemption', 'admin_adjustment']).withMessage('Invalid source'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

exports.redeemPointsValidation = [
    body('points').isInt({ min: 1 }).withMessage('Points must be a positive integer'),
];
