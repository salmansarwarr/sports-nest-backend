const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    senderRole: String,
    message: {
        type: String,
        required: true,
        maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: true });

const supportTicketSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User is required'],
        index: true,
    },

    subject: {
        type: String,
        required: [true, 'Subject is required'],
        trim: true,
        maxlength: [200, 'Subject cannot exceed 200 characters'],
    },

    category: {
        type: String,
        enum: ['booking-issue', 'payment-issue', 'refund-dispute', 'account', 'technical', 'other'],
        default: 'other',
    },

    description: {
        type: String,
        required: [true, 'Description is required'],
        maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },

    relatedBooking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
    },

    status: {
        type: String,
        enum: ['open', 'in-progress', 'resolved', 'closed'],
        default: 'open',
        index: true,
    },

    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
    },

    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    messages: [ticketMessageSchema],

    resolvedAt: Date,
    closedAt: Date,
}, {
    timestamps: true,
});

supportTicketSchema.index({ user: 1, status: 1 });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

module.exports = SupportTicket;
