const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
    question: {
        type: String,
        required: [true, 'Question is required'],
        trim: true,
    },

    answer: {
        type: String,
        required: [true, 'Answer is required'],
    },

    category: {
        type: String,
        enum: ['booking', 'payment', 'account', 'venue-owner', 'general'],
        default: 'general',
        index: true,
    },

    order: {
        type: Number,
        default: 0,
    },

    isPublished: {
        type: Boolean,
        default: true,
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});

const Faq = mongoose.model('Faq', faqSchema);

module.exports = Faq;
