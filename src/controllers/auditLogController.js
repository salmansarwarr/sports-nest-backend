const AuditLog = require('../models/AuditLog');

/**
 * @desc    List audit log entries
 * @route   GET /api/audit-logs
 * @access  Private (Admin)
 */
exports.getAuditLogs = async (req, res, next) => {
    try {
        const {
            actor,
            action,
            resourceType,
            resourceId,
            startDate,
            endDate,
            page = 1,
            limit = 20,
        } = req.query;

        const query = {};
        if (actor) query.actor = actor;
        if (action) query.action = action;
        if (resourceType) query.resourceType = resourceType;
        if (resourceId) query.resourceId = resourceId;

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await AuditLog.find(query)
            .populate('actor', 'firstName lastName email role')
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const total = await AuditLog.countDocuments(query);

        res.status(200).json({
            success: true,
            count: logs.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: logs
        });
    } catch (error) {
        next(error);
    }
};
