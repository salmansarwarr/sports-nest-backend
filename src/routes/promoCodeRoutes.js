const express = require('express');
const router = express.Router();
const promoCodeController = require('../controllers/promoCodeController');
const { authenticate, authorize } = require('../middleware/auth');
const {
    createPromoCodeValidation,
    updatePromoCodeValidation,
    validatePromoCodeValidation,
    getPromoCodesQueryValidation,
    mongoIdValidation,
} = require('../middleware/promoCodeValidation');

/**
 * @swagger
 * tags:
 *   name: PromoCodes
 *   description: Promotional/coupon code management
 */

/**
 * @swagger
 * /api/promo-codes:
 *   post:
 *     summary: Create a promo code
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Promo code created successfully
 */
router.post('/', authenticate, authorize('owner', 'admin'), createPromoCodeValidation, promoCodeController.createPromoCode);

/**
 * @swagger
 * /api/promo-codes:
 *   get:
 *     summary: List promo codes
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promo codes retrieved successfully
 */
router.get('/', authenticate, authorize('owner', 'admin'), getPromoCodesQueryValidation, promoCodeController.getPromoCodes);

/**
 * @swagger
 * /api/promo-codes/validate:
 *   post:
 *     summary: Validate a promo code and preview its discount
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promo code is valid
 *       400:
 *         description: Promo code is not valid for this booking
 */
router.post('/validate', authenticate, validatePromoCodeValidation, promoCodeController.validatePromoCode);

/**
 * @swagger
 * /api/promo-codes/{id}:
 *   get:
 *     summary: Get a single promo code
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promo code retrieved successfully
 */
router.get('/:id', authenticate, authorize('owner', 'admin'), mongoIdValidation, promoCodeController.getPromoCode);

/**
 * @swagger
 * /api/promo-codes/{id}:
 *   put:
 *     summary: Update a promo code
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promo code updated successfully
 */
router.put('/:id', authenticate, authorize('owner', 'admin'), mongoIdValidation, updatePromoCodeValidation, promoCodeController.updatePromoCode);

/**
 * @swagger
 * /api/promo-codes/{id}:
 *   delete:
 *     summary: Delete a promo code
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promo code deleted successfully
 */
router.delete('/:id', authenticate, authorize('owner', 'admin'), mongoIdValidation, promoCodeController.deletePromoCode);

module.exports = router;
