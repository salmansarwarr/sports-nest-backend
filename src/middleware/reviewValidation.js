const { body, param, query } = require('express-validator');

exports.createReviewValidation = [
    body('booking')
        .notEmpty().withMessage('Booking is required')
        .isMongoId().withMessage('Invalid booking ID'),

    body('rating')
        .notEmpty().withMessage('Rating is required')
        .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),

    body('comment')
        .optional()
        .isString()
        .isLength({ max: 1000 }).withMessage('Comment cannot exceed 1000 characters'),

    body('photos')
        .optional()
        .isArray().withMessage('Photos must be an array'),

    body('photos.*.url')
        .optional()
        .isURL().withMessage('Photo URL must be valid'),
];

exports.updateReviewValidation = [
    body('rating')
        .optional()
        .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),

    body('comment')
        .optional()
        .isString()
        .isLength({ max: 1000 }).withMessage('Comment cannot exceed 1000 characters'),
];

exports.replyValidation = [
    body('text')
        .notEmpty().withMessage('Reply text is required')
        .isLength({ max: 1000 }).withMessage('Reply cannot exceed 1000 characters'),
];

exports.reportValidation = [
    body('reason')
        .notEmpty().withMessage('A reason is required to report a review')
        .isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters'),
];

exports.moderateValidation = [
    body('status')
        .notEmpty().withMessage('Status is required')
        .isIn(['approved', 'pending', 'rejected']).withMessage('Invalid status'),

    body('moderationReason')
        .optional()
        .isString(),
];

exports.getReviewsQueryValidation = [
    query('court').optional().isMongoId().withMessage('Invalid court ID'),
    query('venue').optional().isMongoId().withMessage('Invalid venue ID'),
    query('user').optional().isMongoId().withMessage('Invalid user ID'),
    query('status').optional().isIn(['approved', 'pending', 'rejected']).withMessage('Invalid status'),
    query('reported').optional().isBoolean().withMessage('reported must be a boolean'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

exports.mongoIdValidation = [
    param('id').isMongoId().withMessage('Invalid review ID'),
];
