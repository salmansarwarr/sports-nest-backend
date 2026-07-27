const Favorite = require('../models/Favorite');
const Court = require('../models/Court');
const Venue = require('../models/Venue');
const { validationResult } = require('express-validator');

const MODELS = { Court, Venue };

/**
 * @desc    Add a court/venue to favorites
 * @route   POST /api/favorites
 * @access  Private
 */
exports.addFavorite = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { itemType, itemId } = req.body;

        const item = await MODELS[itemType].findById(itemId);
        if (!item) {
            return res.status(404).json({
                success: false,
                message: `${itemType} not found`
            });
        }

        const existing = await Favorite.findOne({ user: req.user._id, itemType, itemId });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Already in favorites'
            });
        }

        const favorite = await Favorite.create({ user: req.user._id, itemType, itemId });

        res.status(201).json({
            success: true,
            message: 'Added to favorites',
            data: favorite
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get the current user's favorites
 * @route   GET /api/favorites
 * @access  Private
 */
exports.getFavorites = async (req, res, next) => {
    try {
        const { itemType, page = 1, limit = 20 } = req.query;

        const query = { user: req.user._id };
        if (itemType) query.itemType = itemType;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const favorites = await Favorite.find(query)
            .populate('itemId')
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Favorite.countDocuments(query);

        res.status(200).json({
            success: true,
            count: favorites.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: favorites
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Remove a favorite
 * @route   DELETE /api/favorites/:id
 * @access  Private
 */
exports.removeFavorite = async (req, res, next) => {
    try {
        const favorite = await Favorite.findById(req.params.id);

        if (!favorite) {
            return res.status(404).json({
                success: false,
                message: 'Favorite not found'
            });
        }

        if (favorite.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to remove this favorite'
            });
        }

        await favorite.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Removed from favorites'
        });
    } catch (error) {
        next(error);
    }
};
