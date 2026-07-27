const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favoriteController');
const { authenticate } = require('../middleware/auth');
const { addFavoriteValidation, mongoIdValidation } = require('../middleware/favoriteValidation');

/**
 * @swagger
 * tags:
 *   name: Favorites
 *   description: Favorites/wishlist endpoints
 */

/**
 * @swagger
 * /api/favorites:
 *   post:
 *     summary: Add a court or venue to favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Added to favorites
 */
router.post('/', authenticate, addFavoriteValidation, favoriteController.addFavorite);

/**
 * @swagger
 * /api/favorites:
 *   get:
 *     summary: Get the current user's favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Favorites retrieved successfully
 */
router.get('/', authenticate, favoriteController.getFavorites);

/**
 * @swagger
 * /api/favorites/{id}:
 *   delete:
 *     summary: Remove a favorite
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Removed from favorites
 */
router.delete('/:id', authenticate, mongoIdValidation, favoriteController.removeFavorite);

module.exports = router;
