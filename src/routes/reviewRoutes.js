const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate, authorize, optionalAuthenticate } = require('../middleware/auth');
const {
    createReviewValidation,
    updateReviewValidation,
    replyValidation,
    reportValidation,
    moderateValidation,
    getReviewsQueryValidation,
    mongoIdValidation,
} = require('../middleware/reviewValidation');

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Court review and rating endpoints
 */

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Submit a review for a completed booking
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Review submitted successfully
 *       400:
 *         description: Booking not completed or already reviewed
 */
router.post('/', authenticate, createReviewValidation, reviewController.createReview);

/**
 * @swagger
 * /api/reviews:
 *   get:
 *     summary: List reviews with filtering
 *     tags: [Reviews]
 *     responses:
 *       200:
 *         description: Reviews retrieved successfully
 */
router.get('/', optionalAuthenticate, getReviewsQueryValidation, reviewController.getReviews);

/**
 * @swagger
 * /api/reviews/{id}:
 *   get:
 *     summary: Get a single review
 *     tags: [Reviews]
 *     responses:
 *       200:
 *         description: Review retrieved successfully
 */
router.get('/:id', mongoIdValidation, reviewController.getReview);

/**
 * @swagger
 * /api/reviews/{id}:
 *   put:
 *     summary: Update own review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Review updated successfully
 */
router.put('/:id', authenticate, mongoIdValidation, updateReviewValidation, reviewController.updateReview);

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     summary: Delete own review (or admin)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Review deleted successfully
 */
router.delete('/:id', authenticate, mongoIdValidation, reviewController.deleteReview);

/**
 * @swagger
 * /api/reviews/{id}/reply:
 *   post:
 *     summary: Reply to a review (court/venue owner, manager, or admin)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reply added successfully
 */
router.post('/:id/reply', authenticate, mongoIdValidation, replyValidation, reviewController.replyToReview);

/**
 * @swagger
 * /api/reviews/{id}/report:
 *   post:
 *     summary: Report a review as offensive/inappropriate (court/venue owner or manager)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Review reported successfully
 */
router.post(
    '/:id/report',
    authenticate,
    authorize('owner', 'manager', 'admin'),
    mongoIdValidation,
    reportValidation,
    reviewController.reportReview
);

/**
 * @swagger
 * /api/reviews/{id}/moderate:
 *   put:
 *     summary: Approve or reject a review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Review moderated successfully
 */
router.put(
    '/:id/moderate',
    authenticate,
    authorize('admin'),
    mongoIdValidation,
    moderateValidation,
    reviewController.moderateReview
);

module.exports = router;
