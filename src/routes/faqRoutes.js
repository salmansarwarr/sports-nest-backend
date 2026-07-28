const express = require('express');
const router = express.Router();
const faqController = require('../controllers/faqController');
const { authenticate, authorize } = require('../middleware/auth');
const { createFaqValidation, updateFaqValidation, mongoIdValidation } = require('../middleware/faqValidation');

/**
 * @swagger
 * tags:
 *   name: FAQs
 *   description: Frequently asked questions
 */

/**
 * @swagger
 * /api/faqs:
 *   get:
 *     summary: List published FAQs
 *     tags: [FAQs]
 *     responses:
 *       200:
 *         description: FAQs retrieved successfully
 */
router.get('/', faqController.getFaqs);

/**
 * @swagger
 * /api/faqs:
 *   post:
 *     summary: Create an FAQ
 *     tags: [FAQs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: FAQ created successfully
 */
router.post('/', authenticate, authorize('admin'), createFaqValidation, faqController.createFaq);

/**
 * @swagger
 * /api/faqs/{id}:
 *   put:
 *     summary: Update an FAQ
 *     tags: [FAQs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: FAQ updated successfully
 */
router.put('/:id', authenticate, authorize('admin'), mongoIdValidation, updateFaqValidation, faqController.updateFaq);

/**
 * @swagger
 * /api/faqs/{id}:
 *   delete:
 *     summary: Delete an FAQ
 *     tags: [FAQs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: FAQ deleted successfully
 */
router.delete('/:id', authenticate, authorize('admin'), mongoIdValidation, faqController.deleteFaq);

module.exports = router;
