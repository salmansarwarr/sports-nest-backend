const LegalDocument = require('../models/LegalDocument');
const { validationResult } = require('express-validator');
const auditLog = require('../utils/auditLog');

/**
 * @desc    Get the currently-active version of a legal document
 * @route   GET /api/legal/:type
 * @access  Public
 */
exports.getActiveDocument = async (req, res, next) => {
    try {
        const document = await LegalDocument.findOne({ type: req.params.type, isActive: true });

        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'No published document found for this type'
            });
        }

        res.status(200).json({
            success: true,
            data: document
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Publish a new version of a legal document, deactivating the previous one
 * @route   POST /api/legal
 * @access  Private (Admin)
 */
exports.publishDocument = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { type, version, content } = req.body;

        await LegalDocument.updateMany({ type, isActive: true }, { isActive: false });

        const document = await LegalDocument.create({
            type,
            version,
            content,
            isActive: true,
            publishedBy: req.user._id
        });

        await auditLog.record({
            actor: req.user,
            action: 'legal_document.published',
            resourceType: 'LegalDocument',
            resourceId: document._id,
            changes: { type, version },
            req
        });

        res.status(201).json({
            success: true,
            message: 'Legal document published successfully',
            data: document
        });
    } catch (error) {
        next(error);
    }
};
