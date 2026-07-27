const { body, param } = require('express-validator');

exports.addFavoriteValidation = [
    body('itemType')
        .notEmpty().withMessage('Item type is required')
        .isIn(['Court', 'Venue']).withMessage('Item type must be Court or Venue'),

    body('itemId')
        .notEmpty().withMessage('Item ID is required')
        .isMongoId().withMessage('Invalid item ID'),
];

exports.mongoIdValidation = [
    param('id').isMongoId().withMessage('Invalid favorite ID'),
];
