const Faq = require('../models/Faq');
const { validationResult } = require('express-validator');

/**
 * @desc    List published FAQs
 * @route   GET /api/faqs
 * @access  Public
 */
exports.getFaqs = async (req, res, next) => {
    try {
        const { category } = req.query;

        const query = { isPublished: true };
        if (category) query.category = category;

        const faqs = await Faq.find(query).sort('order');

        res.status(200).json({
            success: true,
            count: faqs.length,
            data: faqs
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Create an FAQ
 * @route   POST /api/faqs
 * @access  Private (Admin)
 */
exports.createFaq = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const faq = await Faq.create({
            ...req.body,
            createdBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'FAQ created successfully',
            data: faq
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update an FAQ
 * @route   PUT /api/faqs/:id
 * @access  Private (Admin)
 */
exports.updateFaq = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const allowedUpdates = ['question', 'answer', 'category', 'order', 'isPublished'];
        const updates = {};
        Object.keys(req.body).forEach((key) => {
            if (allowedUpdates.includes(key)) updates[key] = req.body[key];
        });

        const faq = await Faq.findByIdAndUpdate(req.params.id, updates, {
            new: true,
            runValidators: true
        });

        if (!faq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'FAQ updated successfully',
            data: faq
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete an FAQ
 * @route   DELETE /api/faqs/:id
 * @access  Private (Admin)
 */
exports.deleteFaq = async (req, res, next) => {
    try {
        const faq = await Faq.findByIdAndDelete(req.params.id);
        if (!faq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'FAQ deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};
