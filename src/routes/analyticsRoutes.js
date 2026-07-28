const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middleware/auth');
const {
    getRevenueValidation,
    getOccupancyValidation,
    getPopularCourtsValidation,
    getBookingsSummaryValidation,
} = require('../middleware/analyticsValidation');

router.use(authenticate, authorize('owner', 'manager', 'admin'));

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Revenue, occupancy, and booking analytics
 */

/**
 * @swagger
 * /api/analytics/revenue:
 *   get:
 *     summary: Revenue over time, scoped to the caller's courts
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Revenue data retrieved successfully
 */
router.get('/revenue', getRevenueValidation, analyticsController.getRevenue);

/**
 * @swagger
 * /api/analytics/occupancy:
 *   get:
 *     summary: Occupancy rate per court over a date range
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Occupancy data retrieved successfully
 *       400:
 *         description: startDate and endDate are required
 */
router.get('/occupancy', getOccupancyValidation, analyticsController.getOccupancy);

/**
 * @swagger
 * /api/analytics/popular-courts:
 *   get:
 *     summary: Most-booked courts, scoped to the caller's courts
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Popular courts retrieved successfully
 */
router.get('/popular-courts', getPopularCourtsValidation, analyticsController.getPopularCourts);

/**
 * @swagger
 * /api/analytics/bookings-summary:
 *   get:
 *     summary: Booking status breakdown and daily trend
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bookings summary retrieved successfully
 */
router.get('/bookings-summary', getBookingsSummaryValidation, analyticsController.getBookingsSummary);

module.exports = router;
