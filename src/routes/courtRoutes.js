const express = require('express');
const router = express.Router();
const courtController = require('../controllers/courtController');
const { authenticate, authorize } = require('../middleware/auth');
const {
    createCourtValidation,
    updateCourtValidation,
    courtMediaValidation,
    courtMediaBulkValidation,
    pricingRuleValidation,
    availabilityExceptionValidation,
    calculatePriceValidation,
    checkAvailabilityValidation,
    courtStatusValidation,
    getCourtsQueryValidation,
    mongoIdValidation,
    mongoIdAndMediaIdValidation,
    mongoIdAndRuleIdValidation,
    mongoIdAndExceptionIdValidation,
} = require('../middleware/courtVenueValidation');

/**
 * @swagger
 * components:
 *   schemas:
 *     Court:
 *       type: object
 *       required:
 *         - name
 *         - venue
 *         - sportType
 *         - courtType
 *         - baseHourlyRate
 *       properties:
 *         name:
 *           type: string
 *           description: Court name
 *         courtNumber:
 *           type: string
 *           description: Court number identifier
 *         description:
 *           type: string
 *           description: Court description
 *         venue:
 *           type: string
 *           description: Venue ID reference
 *         sportType:
 *           type: string
 *           enum: [tennis, badminton, squash, basketball, volleyball, pickleball, table-tennis, futsal, other]
 *         surfaceType:
 *           type: string
 *           enum: [hard-court, clay, grass, synthetic-grass, acrylic, concrete, wooden, rubber, carpet, other]
 *         courtType:
 *           type: string
 *           enum: [indoor, outdoor, covered]
 *         baseHourlyRate:
 *           type: number
 *           description: Base price per hour
 *         currency:
 *           type: string
 *           default: PKR
 *         status:
 *           type: string
 *           enum: [active, inactive, maintenance, temporarily-closed]
 */

/**
 * @swagger
 * /api/courts:
 *   post:
 *     summary: Create a new court
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Court'
 *     responses:
 *       201:
 *         description: Court created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 */
router.post(
    '/',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    createCourtValidation,
    courtController.createCourt
);

/**
 * @swagger
 * /api/courts:
 *   get:
 *     summary: Get all courts with filtering and pagination
 *     tags: [Courts]
 *     parameters:
 *       - in: query
 *         name: venue
 *         schema:
 *           type: string
 *         description: Filter by venue ID
 *       - in: query
 *         name: sportType
 *         schema:
 *           type: string
 *         description: Filter by sport type
 *       - in: query
 *         name: courtType
 *         schema:
 *           type: string
 *         description: Filter by court type (indoor/outdoor/covered)
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price filter
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price filter
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *         description: Minimum rating filter
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Text search
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of courts
 */
router.get(
    '/',
    getCourtsQueryValidation,
    courtController.getCourts
);

/**
 * @swagger
 * /api/courts/{id}:
 *   get:
 *     summary: Get single court by ID or slug
 *     tags: [Courts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Court ID or slug
 *     responses:
 *       200:
 *         description: Court details
 *       404:
 *         description: Court not found
 */
router.get(
    '/:id',
    courtController.getCourt
);

/**
 * @swagger
 * /api/courts/{id}:
 *   put:
 *     summary: Update court
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Court'
 *     responses:
 *       200:
 *         description: Court updated successfully
 *       404:
 *         description: Court not found
 *       403:
 *         description: Not authorized
 */
router.put(
    '/:id',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    mongoIdValidation,
    updateCourtValidation,
    courtController.updateCourt
);

/**
 * @swagger
 * /api/courts/{id}:
 *   delete:
 *     summary: Delete court
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Court deleted successfully
 *       404:
 *         description: Court not found
 *       403:
 *         description: Not authorized
 */
router.delete(
    '/:id',
    authenticate,
    authorize('owner', 'admin'),
    mongoIdValidation,
    courtController.deleteCourt
);

/**
 * @swagger
 * /api/courts/{id}/media:
 *   post:
 *     summary: Add media to court
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - url
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [image, video, virtual-tour]
 *               url:
 *                 type: string
 *               publicId:
 *                 type: string
 *               altText:
 *                 type: string
 *               isPrimary:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Media added successfully
 */
router.post(
    '/:id/media',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    mongoIdValidation,
    courtMediaBulkValidation,
    courtController.addMedia
);

/**
 * @swagger
 * /api/courts/{id}/media/{mediaId}:
 *   delete:
 *     summary: Delete media from court
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: mediaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Media deleted successfully
 */
router.delete(
    '/:id/media/:mediaId',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    mongoIdAndMediaIdValidation,
    courtController.deleteMedia
);

/**
 * @swagger
 * /api/courts/{id}/pricing-rules:
 *   post:
 *     summary: Add pricing rule to court
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *               - baseRate
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [peak, off-peak, weekend, weekday, seasonal, holiday, promotional, early-bird, last-minute]
 *               baseRate:
 *                 type: number
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               priority:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Pricing rule added successfully
 */
router.post(
    '/:id/pricing-rules',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    mongoIdValidation,
    pricingRuleValidation,
    courtController.addPricingRule
);

/**
 * @swagger
 * /api/courts/{id}/pricing-rules/{ruleId}:
 *   put:
 *     summary: Update pricing rule
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pricing rule updated successfully
 */
router.put(
    '/:id/pricing-rules/:ruleId',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    mongoIdAndRuleIdValidation,
    courtController.updatePricingRule
);

/**
 * @swagger
 * /api/courts/{id}/pricing-rules/{ruleId}:
 *   delete:
 *     summary: Delete pricing rule
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pricing rule deleted successfully
 */
router.delete(
    '/:id/pricing-rules/:ruleId',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    mongoIdAndRuleIdValidation,
    courtController.deletePricingRule
);

/**
 * @swagger
 * /api/courts/{id}/availability-exceptions:
 *   post:
 *     summary: Add availability exception
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - type
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               type:
 *                 type: string
 *                 enum: [holiday, maintenance, special-event, blackout, custom]
 *               isAvailable:
 *                 type: boolean
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Availability exception added successfully
 */
router.post(
    '/:id/availability-exceptions',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    mongoIdValidation,
    availabilityExceptionValidation,
    courtController.addAvailabilityException
);

/**
 * @swagger
 * /api/courts/{id}/availability-exceptions/{exceptionId}:
 *   delete:
 *     summary: Delete availability exception
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Availability exception deleted successfully
 */
router.delete(
    '/:id/availability-exceptions/:exceptionId',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    mongoIdAndExceptionIdValidation,
    courtController.deleteAvailabilityException
);

/**
 * @swagger
 * /api/courts/{id}/calculate-price:
 *   post:
 *     summary: Calculate price for time slot
 *     tags: [Courts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startTime
 *               - endTime
 *             properties:
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               membershipTier:
 *                 type: string
 *               groupSize:
 *                 type: integer
 *               isEarlyBird:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Price calculated successfully
 */
router.post(
    '/:id/calculate-price',
    mongoIdValidation,
    calculatePriceValidation,
    courtController.calculatePrice
);

/**
 * @swagger
 * /api/courts/{id}/check-availability:
 *   post:
 *     summary: Check availability for time slot
 *     tags: [Courts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startTime
 *               - endTime
 *             properties:
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Availability checked successfully
 */
router.post(
    '/:id/check-availability',
    mongoIdValidation,
    checkAvailabilityValidation,
    courtController.checkAvailability
);

/**
 * @swagger
 * /api/courts/{id}/status:
 *   patch:
 *     summary: Update court status
 *     tags: [Courts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, maintenance, temporarily-closed]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated successfully
 */
router.patch(
    '/:id/status',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    mongoIdValidation,
    courtStatusValidation,
    courtController.updateStatus
);

module.exports = router;