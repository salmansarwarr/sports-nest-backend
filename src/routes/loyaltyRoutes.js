const express = require('express');
const router = express.Router();
const loyaltyController = require('../controllers/loyaltyController');
const { authenticate } = require('../middleware/auth');
const {
    getTransactionsQueryValidation,
    redeemPointsValidation,
} = require('../middleware/loyaltyValidation');

/**
 * @swagger
 * tags:
 *   name: Loyalty
 *   description: Loyalty points balance, ledger, and redemption into wallet credit
 */

/**
 * @swagger
 * /api/loyalty:
 *   get:
 *     summary: Get the current user's loyalty points balance
 *     tags: [Loyalty]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Loyalty points balance retrieved successfully
 */
router.get('/', authenticate, loyaltyController.getLoyalty);

/**
 * @swagger
 * /api/loyalty/transactions:
 *   get:
 *     summary: Get the current user's loyalty points ledger
 *     tags: [Loyalty]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Loyalty transactions retrieved successfully
 */
router.get('/transactions', authenticate, getTransactionsQueryValidation, loyaltyController.getTransactions);

/**
 * @swagger
 * /api/loyalty/redeem:
 *   post:
 *     summary: Redeem loyalty points into wallet credit
 *     tags: [Loyalty]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - points
 *             properties:
 *               points:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Points redeemed successfully
 *       400:
 *         description: Insufficient loyalty points
 */
router.post('/redeem', authenticate, redeemPointsValidation, loyaltyController.redeemPoints);

module.exports = router;
