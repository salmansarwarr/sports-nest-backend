const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const { validationResult } = require('express-validator');
const stripeUtil = require('../utils/stripe');
const auditLog = require('../utils/auditLog');

/**
 * @desc    Get the current user's wallet balance
 * @route   GET /api/wallet
 * @access  Private
 */
exports.getWallet = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            data: { walletBalance: req.user.walletBalance }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get the current user's wallet ledger
 * @route   GET /api/wallet/transactions
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

        const transactions = await WalletTransaction.find(query)
            .populate('booking', 'bookingNumber startTime endTime')
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const total = await WalletTransaction.countDocuments(query);

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
 * @desc    Create a Stripe payment intent to top up the current user's wallet
 * @route   POST /api/wallet/top-up
 * @access  Private
 */
exports.topUp = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { amount } = req.body;
        const currency = req.user.preferences?.currency || 'PKR';

        const intent = await stripeUtil.createPaymentIntent({
            amount,
            currency,
            metadata: {
                purpose: 'wallet_topup',
                userId: req.user._id.toString()
            }
        });

        res.status(201).json({
            success: true,
            message: 'Top-up payment intent created',
            data: { clientSecret: intent.client_secret }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Manually adjust a user's wallet balance
 * @route   POST /api/wallet/admin/:userId/adjust
 * @access  Private (Admin)
 */
exports.adjustWallet = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { userId } = req.params;
        const { amount, type, reason } = req.body;

        const updatedUser = type === 'credit'
            ? await User.creditWallet(userId, amount, { source: 'admin_adjustment', description: reason })
            : await User.debitWallet(userId, amount, { source: 'admin_adjustment', description: reason });

        if (!updatedUser) {
            return res.status(400).json({
                success: false,
                message: type === 'credit' ? 'Unable to credit wallet' : 'Insufficient wallet balance'
            });
        }

        await auditLog.record({
            actor: req.user,
            action: 'wallet.admin_adjusted',
            resourceType: 'User',
            resourceId: userId,
            changes: { amount, type },
            reason,
            req
        });

        res.status(200).json({
            success: true,
            message: 'Wallet adjusted successfully',
            data: { walletBalance: updatedUser.walletBalance }
        });
    } catch (error) {
        next(error);
    }
};
