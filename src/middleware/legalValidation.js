const { body, param } = require('express-validator');

exports.publishDocumentValidation = [
    body('type')
        .notEmpty().withMessage('Type is required')
        .isIn(['terms-of-service', 'privacy-policy']).withMessage('Invalid document type'),

    body('version').notEmpty().withMessage('Version is required'),

    body('content').notEmpty().withMessage('Content is required'),
];

exports.typeParamValidation = [
    param('type').isIn(['terms-of-service', 'privacy-policy']).withMessage('Invalid document type'),
];
