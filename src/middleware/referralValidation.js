const { query } = require('express-validator');

exports.getReferralsQueryValidation = [
    query('status').optional().isIn(['pending', 'qualified', 'rewarded']).withMessage('Invalid status'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];
