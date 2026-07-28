const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const {
    createPaymentIntentValidation,
    getPaymentHistoryQueryValidation,
    mongoIdValidation,
} = require('../middleware/paymentValidation');

// NOTE: the Stripe webhook route (POST /api/payments/webhook) is NOT defined
// here - it's mounted directly in src/app.js with express.raw() BEFORE the
// global express.json() parser, since Stripe signature verification needs
// the raw request body. Do not add a /webhook route to this router.

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment processing, history, and receipts
 */

/**
 * @swagger
 * /api/payments/create-intent:
 *   post:
 *     summary: Create a Stripe payment intent for a booking
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Payment intent created
 *       400:
 *         description: Booking already paid
 */
router.post('/create-intent', authenticate, createPaymentIntentValidation, paymentController.createPaymentIntent);

/**
 * @swagger
 * /api/payments/history:
 *   get:
 *     summary: Get the current user's payment history
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment history retrieved successfully
 */
router.get('/history', authenticate, getPaymentHistoryQueryValidation, paymentController.getPaymentHistory);

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Get a single payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment retrieved successfully
 */
router.get('/:id', authenticate, mongoIdValidation, paymentController.getPayment);

/**
 * @swagger
 * /api/payments/{id}/receipt:
 *   get:
 *     summary: Download a PDF receipt for a completed payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF receipt
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Receipt only available for completed payments
 */
router.get('/:id/receipt', authenticate, mongoIdValidation, paymentController.getReceipt);

module.exports = router;
