const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const { authenticate } = require('../middleware/auth');
const { getReferralsQueryValidation } = require('../middleware/referralValidation');

/**
 * @swagger
 * tags:
 *   name: Referrals
 *   description: Referral code and referral tracking
 */

/**
 * @swagger
 * /api/referrals/my-code:
 *   get:
 *     summary: Get the current user's shareable referral code
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral code retrieved successfully
 */
router.get('/my-code', authenticate, referralController.getMyCode);

/**
 * @swagger
 * /api/referrals:
 *   get:
 *     summary: Get the current user's list of referrals sent
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referrals retrieved successfully
 */
router.get('/', authenticate, getReferralsQueryValidation, referralController.getReferrals);

module.exports = router;
