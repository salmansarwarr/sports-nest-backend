const User = require('../models/User');
const Referral = require('../models/Referral');
const { validationResult } = require('express-validator');
const { generateUniqueReferralCode } = require('../utils/referral');

/**
 * @desc    Get the current user's shareable referral code
 * @route   GET /api/referrals/my-code
 * @access  Private
 */
exports.getMyCode = async (req, res, next) => {
    try {
        let user = req.user;

        // Covers any user created before referral codes existed - generated
        // and persisted on first access rather than a bulk backfill script.
        if (!user.referralCode) {
            user.referralCode = await generateUniqueReferralCode();
            await user.save();
        }

        res.status(200).json({
            success: true,
            data: { referralCode: user.referralCode }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get the current user's list of referrals sent
 * @route   GET /api/referrals
 * @access  Private
 */
exports.getReferrals = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { status, page = 1, limit = 20 } = req.query;

        const query = { referrer: req.user._id };
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const referrals = await Referral.find(query)
            .populate('referredUser', 'firstName lastName email')
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Referral.countDocuments(query);

        res.status(200).json({
            success: true,
            count: referrals.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: referrals
        });
    } catch (error) {
        next(error);
    }
};
