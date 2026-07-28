const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticate, authorize } = require('../middleware/auth');
const {
    getTransactionsQueryValidation,
    topUpValidation,
    adjustWalletValidation,
} = require('../middleware/walletValidation');

/**
 * @swagger
 * tags:
 *   name: Wallet
 *   description: Wallet balance, top-up, and transaction ledger
 */

/**
 * @swagger
 * /api/wallet:
 *   get:
 *     summary: Get the current user's wallet balance
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance retrieved successfully
 */
router.get('/', authenticate, walletController.getWallet);

/**
 * @swagger
 * /api/wallet/transactions:
 *   get:
 *     summary: Get the current user's wallet transaction ledger
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet transactions retrieved successfully
 */
router.get('/transactions', authenticate, getTransactionsQueryValidation, walletController.getTransactions);

/**
 * @swagger
 * /api/wallet/top-up:
 *   post:
 *     summary: Create a Stripe payment intent to top up the wallet
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Top-up payment intent created
 */
router.post('/top-up', authenticate, topUpValidation, walletController.topUp);

/**
 * @swagger
 * /api/wallet/admin/{userId}/adjust:
 *   post:
 *     summary: Manually adjust a user's wallet balance
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet adjusted successfully
 *       403:
 *         description: Not authorized
 */
router.post('/admin/:userId/adjust', authenticate, authorize('admin'), adjustWalletValidation, walletController.adjustWallet);

module.exports = router;
