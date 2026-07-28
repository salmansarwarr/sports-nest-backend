const PromoCode = require('../models/PromoCode');
const Court = require('../models/Court');
const { validationResult } = require('express-validator');
const auditLog = require('../utils/auditLog');

/**
 * @desc    Create a promo code
 * @route   POST /api/promo-codes
 * @access  Private (Owner/Admin)
 */
exports.createPromoCode = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const promoCode = await PromoCode.create({
            ...req.body,
            createdBy: req.user._id
        });

        await auditLog.record({
            actor: req.user,
            action: 'promo_code.created',
            resourceType: 'PromoCode',
            resourceId: promoCode._id,
            changes: { code: promoCode.code, discountType: promoCode.discountType, discountValue: promoCode.discountValue },
            req
        });

        res.status(201).json({
            success: true,
            message: 'Promo code created successfully',
            data: promoCode
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    List promo codes
 * @route   GET /api/promo-codes
 * @access  Private (Owner/Admin)
 */
exports.getPromoCodes = async (req, res, next) => {
    try {
        const { isActive, page = 1, limit = 20 } = req.query;

        const query = {};
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const promoCodes = await PromoCode.find(query)
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const total = await PromoCode.countDocuments(query);

        res.status(200).json({
            success: true,
            count: promoCodes.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: promoCodes
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get a single promo code
 * @route   GET /api/promo-codes/:id
 * @access  Private (Owner/Admin)
 */
exports.getPromoCode = async (req, res, next) => {
    try {
        const promoCode = await PromoCode.findById(req.params.id);
        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        res.status(200).json({
            success: true,
            data: promoCode
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update a promo code
 * @route   PUT /api/promo-codes/:id
 * @access  Private (Owner/Admin)
 */
exports.updatePromoCode = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const allowedUpdates = [
            'description', 'discountValue', 'maxDiscountAmount', 'minBookingAmount',
            'validFrom', 'validUntil', 'usageLimit', 'usageLimitPerUser',
            'applicableVenues', 'applicableCourts', 'isActive'
        ];
        const updates = {};
        Object.keys(req.body).forEach((key) => {
            if (allowedUpdates.includes(key)) updates[key] = req.body[key];
        });

        const promoCode = await PromoCode.findByIdAndUpdate(req.params.id, updates, {
            new: true,
            runValidators: true
        });

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        await auditLog.record({
            actor: req.user,
            action: 'promo_code.updated',
            resourceType: 'PromoCode',
            resourceId: promoCode._id,
            changes: updates,
            req
        });

        res.status(200).json({
            success: true,
            message: 'Promo code updated successfully',
            data: promoCode
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete a promo code
 * @route   DELETE /api/promo-codes/:id
 * @access  Private (Owner/Admin)
 */
exports.deletePromoCode = async (req, res, next) => {
    try {
        const promoCode = await PromoCode.findByIdAndDelete(req.params.id);
        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        await auditLog.record({
            actor: req.user,
            action: 'promo_code.deleted',
            resourceType: 'PromoCode',
            resourceId: promoCode._id,
            changes: { code: promoCode.code },
            req
        });

        res.status(200).json({
            success: true,
            message: 'Promo code deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Validate a promo code and preview its discount, without applying it
 * @route   POST /api/promo-codes/validate
 * @access  Private
 */
exports.validatePromoCode = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { code, court, amount } = req.body;

        const courtDoc = await Court.findById(court);
        if (!courtDoc) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        const promo = await PromoCode.findOne({ code: code.toUpperCase() });
        if (!promo) {
            return res.status(404).json({
                success: false,
                message: 'Invalid promo code'
            });
        }

        const validity = promo.isValidFor(amount, court, courtDoc.venue);
        if (!validity.valid) {
            return res.status(400).json({
                success: false,
                message: validity.reason
            });
        }

        const discount = promo.calculateDiscount(amount);

        res.status(200).json({
            success: true,
            data: {
                code: promo.code,
                discount,
                finalAmount: amount - discount
            }
        });
    } catch (error) {
        next(error);
    }
};
