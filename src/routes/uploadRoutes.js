const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../utils/cloudinary');

/**
 * @swagger
 * tags:
 *   name: Uploads
 *   description: Generic file uploads (e.g. legal documents attached before a
 *     parent record like a venue exists yet)
 */

/**
 * @swagger
 * /api/uploads/document:
 *   post:
 *     summary: Upload a single document (image or PDF) to Cloudinary
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 */
router.post(
    '/document',
    authenticate,
    authorize('owner', 'admin'),
    upload.uploadAttachments.single('document'),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'A document file is required'
                });
            }

            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'sports-nest/venue-documents'
            });

            res.status(201).json({
                success: true,
                message: 'Document uploaded successfully',
                data: {
                    url: result.secure_url,
                    publicId: result.public_id,
                    filename: req.file.originalname
                }
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /api/uploads/review-photo:
 *   post:
 *     summary: Upload a single review photo (image) to Cloudinary
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Photo uploaded successfully
 */
router.post(
    '/review-photo',
    authenticate,
    upload.single('photo'),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'A photo file is required'
                });
            }

            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'sports-nest/reviews'
            });

            res.status(201).json({
                success: true,
                message: 'Photo uploaded successfully',
                data: {
                    url: result.secure_url,
                    publicId: result.public_id,
                    filename: req.file.originalname
                }
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;
