const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate: protect, authorize } = require('../middleware/auth');
const {
    createBookingValidation,
    updateBookingValidation,
    cancelBookingValidation,
    checkAvailabilityValidation,
    getAvailableSlotsValidation,
    rejectBookingValidation,
    getBookingsQueryValidation,
    mongoIdValidation,
} = require('../middleware/bookingValidation');

/**
 * @swagger
 * components:
 *   schemas:
 *     Booking:
 *       type: object
 *       required:
 *         - court
 *         - startTime
 *         - endTime
 *       properties:
 *         bookingNumber:
 *           type: string
 *           description: Auto-generated unique booking number
 *         court:
 *           type: string
 *           description: Court ID
 *         startTime:
 *           type: string
 *           format: date-time
 *         endTime:
 *           type: string
 *           format: date-time
 *         bookingType:
 *           type: string
 *           enum: [single, recurring]
 *           default: single
 *         status:
 *           type: string
 *           enum: [pending-confirmation, confirmed, in-progress, completed, cancelled, no-show, expired]
 *         pricing:
 *           type: object
 *           properties:
 *             totalAmount:
 *               type: number
 *             currency:
 *               type: string
 *         groupSize:
 *           type: integer
 *           minimum: 1
 *         notes:
 *           type: string
 *         specialRequests:
 *           type: string
 */

/**
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Create a new booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - court
 *               - startTime
 *               - endTime
 *             properties:
 *               court:
 *                 type: string
 *                 description: Court ID
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               bookingType:
 *                 type: string
 *                 enum: [single, recurring]
 *               recurringPattern:
 *                 type: object
 *                 properties:
 *                   frequency:
 *                     type: string
 *                     enum: [daily, weekly, monthly]
 *                   interval:
 *                     type: integer
 *                   daysOfWeek:
 *                     type: array
 *                     items:
 *                       type: integer
 *                   endDate:
 *                     type: string
 *                     format: date-time
 *                   occurrences:
 *                     type: integer
 *               groupSize:
 *                 type: integer
 *               isGroupBooking:
 *                 type: boolean
 *               notes:
 *                 type: string
 *               specialRequests:
 *                 type: string
 *     responses:
 *       201:
 *         description: Booking created successfully
 *       400:
 *         description: Validation error or court not available
 *       409:
 *         description: Time slot conflict
 */
router.post(
    '/',
    protect,
    createBookingValidation,
    bookingController.createBooking
);

/**
 * @swagger
 * /api/bookings:
 *   get:
 *     summary: Get all bookings with filtering
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by booking status
 *       - in: query
 *         name: court
 *         schema:
 *           type: string
 *         description: Filter by court ID
 *       - in: query
 *         name: venue
 *         schema:
 *           type: string
 *         description: Filter by venue ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter bookings from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter bookings until this date
 *       - in: query
 *         name: bookingType
 *         schema:
 *           type: string
 *         description: Filter by booking type
 *       - in: query
 *         name: isPaid
 *         schema:
 *           type: boolean
 *         description: Filter by payment status
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
 *         description: List of bookings
 */
router.get(
    '/',
    protect,
    getBookingsQueryValidation,
    bookingController.getBookings
);

/**
 * @swagger
 * /api/bookings/check-availability:
 *   post:
 *     summary: Check availability for a time slot
 *     tags: [Bookings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - court
 *               - startTime
 *               - endTime
 *             properties:
 *               court:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Availability status
 */
router.post(
    '/check-availability',
    checkAvailabilityValidation,
    bookingController.checkAvailability
);

/**
 * @swagger
 * /api/bookings/available-slots/{courtId}:
 *   get:
 *     summary: Get available time slots for a court on a specific date
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: courtId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: interval
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Time slot interval in minutes
 *     responses:
 *       200:
 *         description: List of available slots
 */
router.get(
    '/available-slots/:courtId',
    getAvailableSlotsValidation,
    bookingController.getAvailableSlots
);

/**
 * @swagger
 * /api/bookings/my-bookings:
 *   get:
 *     summary: Get current user's bookings
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: upcoming
 *         schema:
 *           type: boolean
 *         description: Get only upcoming bookings
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
 *         description: User's bookings with statistics
 */
router.get(
    '/my-bookings',
    protect,
    bookingController.getMyBookings
);

/**
 * @swagger
 * /api/bookings/{id}:
 *   get:
 *     summary: Get single booking by ID or booking number
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID or booking number
 *     responses:
 *       200:
 *         description: Booking details
 *       404:
 *         description: Booking not found
 */
router.get(
    '/:id',
    protect,
    bookingController.getBooking
);

/**
 * @swagger
 * /api/bookings/{id}:
 *   put:
 *     summary: Update/reschedule booking
 *     tags: [Bookings]
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
 *             properties:
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               notes:
 *                 type: string
 *               specialRequests:
 *                 type: string
 *               groupSize:
 *                 type: integer
 *               modificationReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Booking updated successfully
 *       400:
 *         description: Booking cannot be modified
 *       409:
 *         description: New time slot conflict
 */
router.put(
    '/:id',
    protect,
    mongoIdValidation,
    updateBookingValidation,
    bookingController.updateBooking
);

/**
 * @swagger
 * /api/bookings/{id}:
 *   delete:
 *     summary: Cancel booking
 *     tags: [Bookings]
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Booking cancelled successfully with refund info
 *       400:
 *         description: Booking cannot be cancelled
 */
router.delete(
    '/:id',
    protect,
    mongoIdValidation,
    cancelBookingValidation,
    bookingController.cancelBooking
);

/**
 * @swagger
 * /api/bookings/{id}/approve:
 *   post:
 *     summary: Approve pending booking
 *     tags: [Bookings]
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
 *         description: Booking approved successfully
 *       403:
 *         description: Not authorized to approve bookings
 */
router.post(
    '/:id/approve',
    protect,
    authorize('owner', 'manager', 'admin'),
    mongoIdValidation,
    bookingController.approveBooking
);

/**
 * @swagger
 * /api/bookings/{id}/reject:
 *   post:
 *     summary: Reject pending booking
 *     tags: [Bookings]
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Booking rejected successfully
 */
router.post(
    '/:id/reject',
    protect,
    authorize('owner', 'manager', 'admin'),
    mongoIdValidation,
    rejectBookingValidation,
    bookingController.rejectBooking
);

/**
 * @swagger
 * /api/bookings/{id}/check-in:
 *   post:
 *     summary: Check-in to booking
 *     tags: [Bookings]
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
 *         description: Checked in successfully
 *       400:
 *         description: Check-in not allowed at this time
 */
router.post(
    '/:id/check-in',
    protect,
    mongoIdValidation,
    bookingController.checkIn
);

/**
 * @swagger
 * /api/bookings/{id}/check-out:
 *   post:
 *     summary: Check-out from booking
 *     tags: [Bookings]
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
 *         description: Checked out successfully
 *       400:
 *         description: Check-out not allowed
 */
router.post(
    '/:id/check-out',
    protect,
    mongoIdValidation,
    bookingController.checkOut
);

module.exports = router;