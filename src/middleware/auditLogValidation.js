const { query } = require('express-validator');

exports.getAuditLogsQueryValidation = [
    query('actor').optional().isMongoId().withMessage('Invalid actor ID'),
    query('resourceId').optional().isMongoId().withMessage('Invalid resource ID'),
    query('resourceType')
        .optional()
        .isIn(['PromoCode', 'Review', 'Venue', 'Payment', 'Booking', 'User', 'LegalDocument', 'SupportTicket'])
        .withMessage('Invalid resource type'),
    query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date is required'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];
