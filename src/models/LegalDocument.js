const mongoose = require('mongoose');

const legalDocumentSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['terms-of-service', 'privacy-policy'],
        required: [true, 'Type is required'],
        index: true,
    },

    version: {
        type: String,
        required: [true, 'Version is required'],
    },

    content: {
        type: String,
        required: [true, 'Content is required'],
    },

    isActive: {
        type: Boolean,
        default: false,
    },

    publishedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    publishedAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
});

legalDocumentSchema.index({ type: 1, isActive: 1 });

const LegalDocument = mongoose.model('LegalDocument', legalDocumentSchema);

module.exports = LegalDocument;
