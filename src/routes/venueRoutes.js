const express = require('express');
const router = express.Router();
const venueController = require('../controllers/venueController');
const courtController = require('../controllers/courtController');
const { authenticate, authorize } = require('../middleware/auth');
const {
    createVenueValidation,
    updateVenueValidation,
    venueMediaValidation,
    venueStatusValidation,
    getVenuesQueryValidation,
    mongoIdValidation,
    mongoIdAndMediaIdValidation,
    venueIdParamValidation,
} = require('../middleware/courtVenueValidation');

/**
 * @swagger
 * components:
 *   schemas:
 *     Venue:
 *       type: object
 *       required:
 *         - name
 *         - address
 *         - location
 *         - contact
 *         - amenities
 *       properties:
 *         name:
 *           type: string
 *           description: Venue name
 *         displayName:
 *           type: string
 *           description: Display name for the venue
 *         description:
 *           type: string
 *           description: Venue description
 *         address:
 *           type: object
 *           properties:
 *             street:
 *               type: string
 *             city:
 *               type: string
 *             state:
 *               type: string
 *             country:
 *               type: string
 *             postalCode:
 *               type: string
*         location:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               default: Point
 *             coordinates:
 *               type: array
 *               items:
 *                 type: number
 *               description: [longitude, latitude]
 *             googleMapsUrl:
 *               type: string
 *               description: Google Maps URL for the venue location
 *         contact:
 *           type: object
 *           properties:
 *             primaryPhone:
 *               type: string
 *             email:
 *               type: string
 *             website:
 *               type: string
 *         amenities:
 *           type: object
 *           properties:
 *             totalCourts:
 *               type: integer
 *             parking:
 *               type: boolean
 *             wifi:
 *               type: boolean
 *             cafeteria:
 *               type: boolean
 */

/**
 * @swagger
 * /api/venues:
 *   post:
 *     summary: Create a new venue
 *     tags: [Venues]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Venue'
 *     responses:
 *       201:
 *         description: Venue created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.post(
    '/',
    authenticate,
    createVenueValidation,
    venueController.createVenue
);

/**
 * @swagger
 * /api/venues:
 *   get:
 *     summary: Get all venues with filtering and pagination
 *     tags: [Venues]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Text search
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Filter by city
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter by state
 *       - in: query
 *         name: latitude
 *         schema:
 *           type: number
 *         description: Latitude for location-based search
 *       - in: query
 *         name: longitude
 *         schema:
 *           type: number
 *         description: Longitude for location-based search
 *       - in: query
 *         name: maxDistance
 *         schema:
 *           type: integer
 *           default: 10000
 *         description: Max distance in meters
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *         description: Minimum rating filter
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
 *         description: List of venues
 */
router.get(
    '/',
    getVenuesQueryValidation,
    venueController.getVenues
);

/**
 * @swagger
 * /api/venues/nearby:
 *   get:
 *     summary: Find nearby venues
 *     tags: [Venues]
 *     parameters:
 *       - in: query
 *         name: latitude
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: longitude
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxDistance
 *         schema:
 *           type: integer
 *           default: 10000
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of nearby venues
 */
router.get(
    '/nearby',
    venueController.getNearbyVenues
);

/**
 * @swagger
 * /api/venues/my-venues:
 *   get:
 *     summary: Get user's venues
 *     tags: [Venues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
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
 *         description: List of user's venues
 */
router.get(
    '/my-venues',
    authenticate,
    venueController.getMyVenues
);

/**
 * @swagger
 * /api/venues/{id}:
 *   get:
 *     summary: Get single venue by ID or slug
 *     tags: [Venues]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Venue ID or slug
 *     responses:
 *       200:
 *         description: Venue details
 *       404:
 *         description: Venue not found
 */
router.get(
    '/:id',
    venueController.getVenue
);

/**
 * @swagger
 * /api/venues/{id}:
 *   put:
 *     summary: Update venue
 *     tags: [Venues]
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
 *             $ref: '#/components/schemas/Venue'
 *     responses:
 *       200:
 *         description: Venue updated successfully
 *       404:
 *         description: Venue not found
 *       403:
 *         description: Not authorized
 */
router.put(
    '/:id',
    authenticate,
    mongoIdValidation,
    updateVenueValidation,
    venueController.updateVenue
);

/**
 * @swagger
 * /api/venues/{id}:
 *   delete:
 *     summary: Delete venue
 *     tags: [Venues]
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
 *         description: Venue deleted successfully
 *       404:
 *         description: Venue not found
 *       403:
 *         description: Not authorized
 */
router.delete(
    '/:id',
    authenticate,
    authorize('owner', 'admin'),
    mongoIdValidation,
    venueController.deleteVenue
);

/**
 * @swagger
 * /api/venues/{id}/media:
 *   post:
 *     summary: Add media to venue
 *     tags: [Venues]
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
    venueMediaValidation,
    venueController.addMedia
);

/**
 * @swagger
 * /api/venues/{id}/media/{mediaId}:
 *   delete:
 *     summary: Delete media from venue
 *     tags: [Venues]
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
    venueController.deleteMedia
);

/**
 * @swagger
 * /api/venues/{id}/status:
 *   patch:
 *     summary: Update venue status
 *     tags: [Venues]
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
 *                 enum: [active, inactive, pending-verification, suspended]
 *     responses:
 *       200:
 *         description: Status updated successfully
 */
router.patch(
    '/:id/status',
    authenticate,
    authorize('owner', 'admin'),
    mongoIdValidation,
    venueStatusValidation,
    venueController.updateStatus
);

/**
 * @swagger
 * /api/venues/{id}/verify:
 *   post:
 *     summary: Verify venue (Admin only)
 *     tags: [Venues]
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
 *         description: Venue verified successfully
 *       403:
 *         description: Only admins can verify venues
 */
router.post(
    '/:id/verify',
    authenticate,
    authorize('admin'),
    mongoIdValidation,
    venueController.verifyVenue
);

/**
 * @swagger
 * /api/venues/{id}/verification-documents:
 *   post:
 *     summary: Add verification document
 *     tags: [Venues]
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
 *                 enum: [business-license, ownership-proof, id-card, tax-document, other]
 *               url:
 *                 type: string
 *               publicId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document added successfully
 */
router.post(
    '/:id/verification-documents',
    authenticate,
    mongoIdValidation,
    venueController.addVerificationDocument
);

/**
 * @swagger
 * /api/venues/{id}/verification-documents/{docId}:
 *   patch:
 *     summary: Update verification document status (Admin only)
 *     tags: [Venues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: docId
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
 *                 enum: [approved, rejected]
 *     responses:
 *       200:
 *         description: Document status updated successfully
 */
router.patch(
    '/:id/verification-documents/:docId',
    authenticate,
    authorize('admin'),
    venueController.updateVerificationDocumentStatus
);

/**
 * @swagger
 * /api/venues/{id}/update-stats:
 *   post:
 *     summary: Update venue statistics
 *     tags: [Venues]
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
 *         description: Statistics updated successfully
 */
router.post(
    '/:id/update-stats',
    authenticate,
    authorize('owner', 'admin'),
    mongoIdValidation,
    venueController.updateVenueStats
);

/**
 * @swagger
 * /api/venues/{venueId}/courts:
 *   get:
 *     summary: Get courts by venue
 *     tags: [Venues, Courts]
 *     parameters:
 *       - in: path
 *         name: venueId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: courtNumber
 *     responses:
 *       200:
 *         description: List of courts for the venue
 *       404:
 *         description: Venue not found
 */
router.get(
    '/:venueId/courts',
    venueIdParamValidation,
    courtController.getCourtsByVenue
);

module.exports = router;