const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
    gatewayRefundId: String,
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
    reason: String,
    status: {
        type: String,
        enum: ['pending', 'succeeded', 'failed'],
        default: 'succeeded',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

const paymentSchema = new mongoose.Schema({
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: [true, 'Booking is required'],
        index: true,
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User is required'],
        index: true,
    },

    gateway: {
        type: String,
        enum: ['stripe', 'wallet'],
        default: 'stripe',
        required: true,
    },

    gatewayPaymentIntentId: {
        type: String,
        index: true,
    },

    gatewayChargeId: String,

    // Major-unit amount (e.g. 2100 meaning PKR 2100), matching every other
    // money field in this codebase. Cents/minor-unit conversion only ever
    // happens at the Stripe SDK boundary in src/utils/stripe.js.
    amount: {
        type: Number,
        required: true,
        min: 0,
    },

    currency: {
        type: String,
        default: 'PKR',
        uppercase: true,
    },

    status: {
        type: String,
        enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially-refunded', 'cancelled'],
        default: 'pending',
        index: true,
    },

    paymentMethod: String,

    refunds: [refundSchema],

    failureReason: String,

    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
    },

    paidAt: Date,
}, {
    timestamps: true,
});

paymentSchema.index({ user: 1, createdAt: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
