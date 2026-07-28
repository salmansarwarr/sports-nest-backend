const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Actor is required'],
        index: true,
    },

    action: {
        type: String,
        required: [true, 'Action is required'],
        index: true,
    },

    resourceType: {
        type: String,
        enum: ['PromoCode', 'Review', 'Venue', 'Payment', 'Booking', 'User', 'LegalDocument', 'SupportTicket'],
        required: [true, 'Resource type is required'],
    },

    resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'resourceType',
        required: [true, 'Resource ID is required'],
    },

    changes: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
    },

    reason: String,
    ip: String,
    userAgent: String,
}, {
    timestamps: { createdAt: true, updatedAt: false },
});

auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
