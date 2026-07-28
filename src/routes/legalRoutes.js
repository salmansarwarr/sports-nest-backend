const express = require('express');
const router = express.Router();
const legalController = require('../controllers/legalController');
const { authenticate, authorize } = require('../middleware/auth');
const { publishDocumentValidation, typeParamValidation } = require('../middleware/legalValidation');

/**
 * @swagger
 * tags:
 *   name: Legal
 *   description: Terms of service / privacy policy versioning
 */

/**
 * @swagger
 * /api/legal/{type}:
 *   get:
 *     summary: Get the currently-active version of a legal document
 *     tags: [Legal]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [terms-of-service, privacy-policy]
 *     responses:
 *       200:
 *         description: Document retrieved successfully
 *       404:
 *         description: No published document found
 */
router.get('/:type', typeParamValidation, legalController.getActiveDocument);

/**
 * @swagger
 * /api/legal:
 *   post:
 *     summary: Publish a new version of a legal document
 *     tags: [Legal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Legal document published successfully
 */
router.post('/', authenticate, authorize('admin'), publishDocumentValidation, legalController.publishDocument);

module.exports = router;
