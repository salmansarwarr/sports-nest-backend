const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

// Best-effort, non-blocking - same pattern as notify.js and
// bookingController.processRefund. A failure here should never break the
// mutation it's recording.
exports.record = async ({ actor, action, resourceType, resourceId, changes, reason, req }) => {
    try {
        await AuditLog.create({
            actor: actor?._id || actor,
            action,
            resourceType,
            resourceId,
            changes,
            reason,
            ip: req?.ip,
            userAgent: req?.get ? req.get('user-agent') : undefined,
        });
    } catch (error) {
        logger.error('Failed to record audit log', { action, resourceType, resourceId, error: error.message });
    }
};
