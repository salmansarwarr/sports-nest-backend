const { body, param, query } = require('express-validator');

exports.createTicketValidation = [
    body('subject')
        .notEmpty().withMessage('Subject is required')
        .isLength({ max: 200 }).withMessage('Subject cannot exceed 200 characters'),

    body('category')
        .optional()
        .isIn(['booking-issue', 'payment-issue', 'refund-dispute', 'account', 'technical', 'other'])
        .withMessage('Invalid category'),

    body('description')
        .notEmpty().withMessage('Description is required')
        .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),

    body('relatedBooking')
        .optional()
        .isMongoId().withMessage('Invalid booking ID'),
];

exports.addMessageValidation = [
    body('message')
        .notEmpty().withMessage('Message is required')
        .isLength({ max: 2000 }).withMessage('Message cannot exceed 2000 characters'),
];

exports.updateTicketStatusValidation = [
    body('status')
        .optional()
        .isIn(['open', 'in-progress', 'resolved', 'closed']).withMessage('Invalid status'),

    body('priority')
        .optional()
        .isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),

    body('assignedTo')
        .optional()
        .isMongoId().withMessage('Invalid user ID'),
];

exports.getTicketsQueryValidation = [
    query('status').optional().isIn(['open', 'in-progress', 'resolved', 'closed']).withMessage('Invalid status'),
    query('category').optional().isIn(['booking-issue', 'payment-issue', 'refund-dispute', 'account', 'technical', 'other']).withMessage('Invalid category'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

exports.mongoIdValidation = [
    param('id').isMongoId().withMessage('Invalid support ticket ID'),
];
