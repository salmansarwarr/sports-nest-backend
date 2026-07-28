const { body, param, query } = require('express-validator');

exports.createPromoCodeValidation = [
    body('code')
        .notEmpty().withMessage('Code is required')
        .isLength({ min: 3, max: 30 }).withMessage('Code must be between 3 and 30 characters'),

    body('discountType')
        .notEmpty().withMessage('Discount type is required')
        .isIn(['percentage', 'fixed']).withMessage('Discount type must be percentage or fixed'),

    body('discountValue')
        .notEmpty().withMessage('Discount value is required')
        .isFloat({ min: 0 }).withMessage('Discount value must be a positive number'),

    body('maxDiscountAmount')
        .optional()
        .isFloat({ min: 0 }).withMessage('Max discount amount must be a positive number'),

    body('minBookingAmount')
        .optional()
        .isFloat({ min: 0 }).withMessage('Min booking amount must be a positive number'),

    body('validFrom')
        .notEmpty().withMessage('Valid-from date is required')
        .isISO8601().withMessage('Valid-from must be a valid date'),

    body('validUntil')
        .notEmpty().withMessage('Valid-until date is required')
        .isISO8601().withMessage('Valid-until must be a valid date')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.validFrom)) {
                throw new Error('Valid-until date must be after valid-from date');
            }
            return true;
        }),

    body('usageLimit').optional().isInt({ min: 1 }).withMessage('Usage limit must be a positive integer'),
    body('usageLimitPerUser').optional().isInt({ min: 1 }).withMessage('Usage limit per user must be a positive integer'),
    body('applicableVenues').optional().isArray().withMessage('applicableVenues must be an array'),
    body('applicableCourts').optional().isArray().withMessage('applicableCourts must be an array'),
];

exports.updatePromoCodeValidation = [
    body('discountValue').optional().isFloat({ min: 0 }).withMessage('Discount value must be a positive number'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    body('validUntil').optional().isISO8601().withMessage('Valid-until must be a valid date'),
];

exports.validatePromoCodeValidation = [
    body('code').notEmpty().withMessage('Code is required'),
    body('court').notEmpty().withMessage('Court is required').isMongoId().withMessage('Invalid court ID'),
    body('amount').notEmpty().withMessage('Amount is required').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
];

exports.getPromoCodesQueryValidation = [
    query('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

exports.mongoIdValidation = [
    param('id').isMongoId().withMessage('Invalid promo code ID'),
];
