const User = require('../models/User');
const LoyaltyTransaction = require('../models/LoyaltyTransaction');
const { validationResult } = require('express-validator');
const { POINTS_TO_WALLET_RATE } = require('../config/loyaltyRates');
const auditLog = require('../utils/auditLog');

/**
 * @desc    Get the current user's loyalty points balance
 * @route   GET /api/loyalty
 * @access  Private
 */
exports.getLoyalty = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            data: {
                loyaltyPoints: req.user.loyaltyPoints,
                walletValueIfRedeemed: Math.round(req.user.loyaltyPoints * POINTS_TO_WALLET_RATE * 100) / 100
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get the current user's loyalty points ledger
 * @route   GET /api/loyalty/transactions
 * @access  Private
 */
exports.getTransactions = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { type, source, page = 1, limit = 20 } = req.query;

        const query = { user: req.user._id };
        if (type) query.type = type;
        if (source) query.source = source;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const transactions = await LoyaltyTransaction.find(query)
            .populate('booking', 'bookingNumber startTime endTime')
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const total = await LoyaltyTransaction.countDocuments(query);

        res.status(200).json({
            success: true,
            count: transactions.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: transactions
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Redeem loyalty points into wallet credit
 * @route   POST /api/loyalty/redeem
 * @access  Private
 */
exports.redeemPoints = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { points } = req.body;

        if (points > req.user.loyaltyPoints) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient loyalty points'
            });
        }

        const updatedUser = await User.redeemLoyaltyPoints(req.user._id, points);

        if (!updatedUser) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient loyalty points'
            });
        }

        await auditLog.record({
            actor: req.user,
            action: 'loyalty.redeemed',
            resourceType: 'User',
            resourceId: req.user._id,
            changes: { points },
            req
        });

        res.status(200).json({
            success: true,
            message: 'Points redeemed successfully',
            data: {
                loyaltyPoints: updatedUser.loyaltyPoints,
                walletBalance: updatedUser.walletBalance
            }
        });
    } catch (error) {
        next(error);
    }
};
