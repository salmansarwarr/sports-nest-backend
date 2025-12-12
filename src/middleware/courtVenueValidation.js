const { body, param, query } = require('express-validator');

// Venue Validation Rules

exports.createVenueValidation = [
    body('name')
        .trim()
        .notEmpty().withMessage('Venue name is required')
        .isLength({ max: 150 }).withMessage('Venue name cannot exceed 150 characters'),

    body('description')
        .optional()
        .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),

    body('address.street')
        .trim()
        .notEmpty().withMessage('Street address is required'),

    body('address.city')
        .trim()
        .notEmpty().withMessage('City is required'),

    body('address.state')
        .trim()
        .notEmpty().withMessage('State is required'),

    body('address.country')
        .trim()
        .notEmpty().withMessage('Country is required'),

    body('location.coordinates')
        .isArray({ min: 2, max: 2 }).withMessage('Location coordinates must be an array of [longitude, latitude]')
        .custom((coords) => {
            if (coords[0] < -180 || coords[0] > 180) {
                throw new Error('Longitude must be between -180 and 180');
            }
            if (coords[1] < -90 || coords[1] > 90) {
                throw new Error('Latitude must be between -90 and 90');
            }
            return true;
        }),

    body('contact.primaryPhone')
        .trim()
        .notEmpty().withMessage('Primary phone is required'),

    body('contact.email')
        .trim()
        .notEmpty().withMessage('Contact email is required')
        .isEmail().withMessage('Valid email is required')
        .normalizeEmail(),

    body('amenities.totalCourts')
        .notEmpty().withMessage('Total courts is required')
        .isInt({ min: 1 }).withMessage('Total courts must be at least 1'),

    body('timezone')
        .optional()
        .isString(),
];

exports.updateVenueValidation = [
    body('name')
        .optional()
        .trim()
        .isLength({ max: 150 }).withMessage('Venue name cannot exceed 150 characters'),

    body('description')
        .optional()
        .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),

    body('contact.email')
        .optional()
        .trim()
        .isEmail().withMessage('Valid email is required')
        .normalizeEmail(),

    body('location.coordinates')
        .optional()
        .isArray({ min: 2, max: 2 }).withMessage('Location coordinates must be an array of [longitude, latitude]')
        .custom((coords) => {
            if (coords[0] < -180 || coords[0] > 180) {
                throw new Error('Longitude must be between -180 and 180');
            }
            if (coords[1] < -90 || coords[1] > 90) {
                throw new Error('Latitude must be between -90 and 90');
            }
            return true;
        }),
];

exports.venueMediaValidation = [
    body('type')
        .notEmpty().withMessage('Media type is required')
        .isIn(['image', 'video', 'virtual-tour']).withMessage('Invalid media type'),

    body('url')
        .notEmpty().withMessage('Media URL is required')
        .isURL().withMessage('Valid URL is required'),

    body('altText')
        .optional()
        .isString(),

    body('isPrimary')
        .optional()
        .isBoolean(),
];

exports.venueStatusValidation = [
    body('status')
        .notEmpty().withMessage('Status is required')
        .isIn(['active', 'inactive', 'pending-verification', 'suspended']).withMessage('Invalid status'),
];

// Court Validation Rules

exports.createCourtValidation = [
    body('name')
        .trim()
        .notEmpty().withMessage('Court name is required')
        .isLength({ max: 100 }).withMessage('Court name cannot exceed 100 characters'),

    body('venue')
        .notEmpty().withMessage('Venue reference is required')
        .isMongoId().withMessage('Invalid venue ID'),

    body('sportType')
        .notEmpty().withMessage('Sport type is required')
        .isIn(['tennis', 'badminton', 'squash', 'basketball', 'volleyball', 'pickleball', 'table-tennis', 'futsal', 'other'])
        .withMessage('Invalid sport type'),

    body('surfaceType')
        .optional()
        .isIn(['hard-court', 'clay', 'grass', 'synthetic-grass', 'acrylic', 'concrete', 'wooden', 'rubber', 'carpet', 'other'])
        .withMessage('Invalid surface type'),

    body('courtType')
        .notEmpty().withMessage('Court type is required')
        .isIn(['indoor', 'outdoor', 'covered']).withMessage('Invalid court type'),

    body('baseHourlyRate')
        .notEmpty().withMessage('Base hourly rate is required')
        .isFloat({ min: 0 }).withMessage('Base hourly rate must be a positive number'),

    body('currency')
        .optional()
        .isString()
        .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code'),

    body('capacity.minPlayers')
        .optional()
        .isInt({ min: 1 }).withMessage('Minimum players must be at least 1'),

    body('capacity.maxPlayers')
        .optional()
        .isInt({ min: 1 }).withMessage('Maximum players must be at least 1')
        .custom((value, { req }) => {
            if (req.body.capacity?.minPlayers && value < req.body.capacity.minPlayers) {
                throw new Error('Maximum players cannot be less than minimum players');
            }
            return true;
        }),

    body('bookingSettings.minBookingDuration')
        .optional()
        .isInt({ min: 15 }).withMessage('Minimum booking duration must be at least 15 minutes'),

    body('bookingSettings.maxBookingDuration')
        .optional()
        .isInt({ min: 15 }).withMessage('Maximum booking duration must be at least 15 minutes')
        .custom((value, { req }) => {
            if (req.body.bookingSettings?.minBookingDuration && value < req.body.bookingSettings.minBookingDuration) {
                throw new Error('Maximum booking duration cannot be less than minimum booking duration');
            }
            return true;
        }),

    body('bookingSettings.bookingInterval')
        .optional()
        .isInt({ min: 15 }).withMessage('Booking interval must be at least 15 minutes'),

    body('bookingSettings.advanceBookingDays')
        .optional()
        .isInt({ min: 0 }).withMessage('Advance booking days must be a positive number'),

    body('operatingHours')
        .optional()
        .isArray().withMessage('Operating hours must be an array'),

    body('operatingHours.*.dayOfWeek')
        .optional()
        .isInt({ min: 0, max: 6 }).withMessage('Day of week must be between 0 (Sunday) and 6 (Saturday)'),

    body('operatingHours.*.openTime')
        .optional()
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Open time must be in HH:MM format'),

    body('operatingHours.*.closeTime')
        .optional()
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Close time must be in HH:MM format'),
];

exports.updateCourtValidation = [
    body('name')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Court name cannot exceed 100 characters'),

    body('sportType')
        .optional()
        .isIn(['tennis', 'badminton', 'squash', 'basketball', 'volleyball', 'pickleball', 'table-tennis', 'futsal', 'other'])
        .withMessage('Invalid sport type'),

    body('surfaceType')
        .optional()
        .isIn(['hard-court', 'clay', 'grass', 'synthetic-grass', 'acrylic', 'concrete', 'wooden', 'rubber', 'carpet', 'other'])
        .withMessage('Invalid surface type'),

    body('courtType')
        .optional()
        .isIn(['indoor', 'outdoor', 'covered']).withMessage('Invalid court type'),

    body('baseHourlyRate')
        .optional()
        .isFloat({ min: 0 }).withMessage('Base hourly rate must be a positive number'),

    body('status')
        .optional()
        .isIn(['active', 'inactive', 'maintenance', 'temporarily-closed']).withMessage('Invalid status'),
];

exports.courtMediaValidation = [
    body('type')
        .notEmpty().withMessage('Media type is required')
        .isIn(['image', 'video', 'virtual-tour']).withMessage('Invalid media type'),

    body('url')
        .notEmpty().withMessage('Media URL is required')
        .isURL().withMessage('Valid URL is required'),

    body('altText')
        .optional()
        .isString(),

    body('isPrimary')
        .optional()
        .isBoolean(),
];

exports.pricingRuleValidation = [
    body('name')
        .notEmpty().withMessage('Pricing rule name is required'),

    body('type')
        .notEmpty().withMessage('Pricing rule type is required')
        .isIn(['peak', 'off-peak', 'weekend', 'weekday', 'seasonal', 'holiday', 'promotional', 'early-bird', 'last-minute'])
        .withMessage('Invalid pricing rule type'),

    body('baseRate')
        .notEmpty().withMessage('Base rate is required')
        .isFloat({ min: 0 }).withMessage('Base rate must be a positive number'),

    body('startDate')
        .optional()
        .isISO8601().withMessage('Valid start date is required'),

    body('endDate')
        .optional()
        .isISO8601().withMessage('Valid end date is required')
        .custom((value, { req }) => {
            if (req.body.startDate && new Date(value) < new Date(req.body.startDate)) {
                throw new Error('End date cannot be before start date');
            }
            return true;
        }),

    body('daysOfWeek')
        .optional()
        .isArray().withMessage('Days of week must be an array'),

    body('daysOfWeek.*')
        .optional()
        .isInt({ min: 0, max: 6 }).withMessage('Day of week must be between 0 and 6'),

    body('startTime')
        .optional()
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),

    body('endTime')
        .optional()
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format'),

    body('priority')
        .optional()
        .isInt().withMessage('Priority must be an integer'),
];

exports.availabilityExceptionValidation = [
    body('date')
        .notEmpty().withMessage('Date is required')
        .isISO8601().withMessage('Valid date is required'),

    body('type')
        .notEmpty().withMessage('Exception type is required')
        .isIn(['holiday', 'maintenance', 'special-event', 'blackout', 'custom'])
        .withMessage('Invalid exception type'),

    body('isAvailable')
        .optional()
        .isBoolean(),

    body('reason')
        .optional()
        .isString(),
];

exports.calculatePriceValidation = [
    body('startTime')
        .notEmpty().withMessage('Start time is required')
        .isISO8601().withMessage('Valid start time is required'),

    body('endTime')
        .notEmpty().withMessage('End time is required')
        .isISO8601().withMessage('Valid end time is required')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.startTime)) {
                throw new Error('End time must be after start time');
            }
            return true;
        }),

    body('membershipTier')
        .optional()
        .isString(),

    body('groupSize')
        .optional()
        .isInt({ min: 1 }).withMessage('Group size must be at least 1'),

    body('isEarlyBird')
        .optional()
        .isBoolean(),
];

exports.checkAvailabilityValidation = [
    body('startTime')
        .notEmpty().withMessage('Start time is required')
        .isISO8601().withMessage('Valid start time is required'),

    body('endTime')
        .notEmpty().withMessage('End time is required')
        .isISO8601().withMessage('Valid end time is required')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.startTime)) {
                throw new Error('End time must be after start time');
            }
            return true;
        }),
];

exports.courtStatusValidation = [
    body('status')
        .notEmpty().withMessage('Status is required')
        .isIn(['active', 'inactive', 'maintenance', 'temporarily-closed']).withMessage('Invalid status'),

    body('reason')
        .optional()
        .isString(),
];

// Query Parameter Validations

exports.getVenuesQueryValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

    query('latitude')
        .optional()
        .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),

    query('longitude')
        .optional()
        .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),

    query('maxDistance')
        .optional()
        .isInt({ min: 0 }).withMessage('Max distance must be a positive number'),

    query('minRating')
        .optional()
        .isFloat({ min: 0, max: 5 }).withMessage('Min rating must be between 0 and 5'),
];

exports.getCourtsQueryValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

    query('minPrice')
        .optional()
        .isFloat({ min: 0 }).withMessage('Min price must be a positive number'),

    query('maxPrice')
        .optional()
        .isFloat({ min: 0 }).withMessage('Max price must be a positive number'),

    query('minRating')
        .optional()
        .isFloat({ min: 0, max: 5 }).withMessage('Min rating must be between 0 and 5'),
];

// ID Parameter Validations

exports.mongoIdValidation = [
    param('id')
        .isMongoId().withMessage('Invalid ID format'),
];

exports.mongoIdAndMediaIdValidation = [
    param('id')
        .isMongoId().withMessage('Invalid court/venue ID format'),
    param('mediaId')
        .isMongoId().withMessage('Invalid media ID format'),
];

exports.mongoIdAndRuleIdValidation = [
    param('id')
        .isMongoId().withMessage('Invalid court ID format'),
    param('ruleId')
        .isMongoId().withMessage('Invalid rule ID format'),
];

exports.mongoIdAndExceptionIdValidation = [
    param('id')
        .isMongoId().withMessage('Invalid court ID format'),
    param('exceptionId')
        .isMongoId().withMessage('Invalid exception ID format'),
];

exports.venueIdParamValidation = [
    param('venueId')
        .isMongoId().withMessage('Invalid venue ID format'),
];

module.exports = exports;