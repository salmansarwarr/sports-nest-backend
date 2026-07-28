const { body, param, query } = require('express-validator');

exports.getTransactionsQueryValidation = [
    query('type').optional().isIn(['credit', 'debit']).withMessage('Invalid type'),
    query('source').optional().isIn(['booking_payment', 'refund', 'admin_adjustment', 'loyalty_redemption', 'referral_bonus', 'top_up']).withMessage('Invalid source'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

exports.topUpValidation = [
    body('amount').isFloat({ min: 1 }).withMessage('Amount must be a positive number'),
];

exports.adjustWalletValidation = [
    param('userId').isMongoId().withMessage('Invalid user ID'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('type').isIn(['credit', 'debit']).withMessage('Type must be credit or debit'),
    body('reason').notEmpty().withMessage('Reason is required'),
];
