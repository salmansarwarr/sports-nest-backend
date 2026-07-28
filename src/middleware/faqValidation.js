const { body, param } = require('express-validator');

exports.createFaqValidation = [
    body('question').notEmpty().withMessage('Question is required'),
    body('answer').notEmpty().withMessage('Answer is required'),
    body('category')
        .optional()
        .isIn(['booking', 'payment', 'account', 'venue-owner', 'general'])
        .withMessage('Invalid category'),
    body('order').optional().isInt().withMessage('Order must be an integer'),
    body('isPublished').optional().isBoolean().withMessage('isPublished must be a boolean'),
];

exports.updateFaqValidation = [
    body('question').optional().notEmpty().withMessage('Question cannot be empty'),
    body('answer').optional().notEmpty().withMessage('Answer cannot be empty'),
    body('category')
        .optional()
        .isIn(['booking', 'payment', 'account', 'venue-owner', 'general'])
        .withMessage('Invalid category'),
    body('order').optional().isInt().withMessage('Order must be an integer'),
    body('isPublished').optional().isBoolean().withMessage('isPublished must be a boolean'),
];

exports.mongoIdValidation = [
    param('id').isMongoId().withMessage('Invalid FAQ ID'),
];
