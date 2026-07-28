const mongoose = require('mongoose');

// Append-only ledger for loyalty points changes. User.loyaltyPoints is a
// denormalized cache of the running total, kept in sync atomically by
// User.earnLoyaltyPoints/redeemLoyaltyPoints - mirrors the
// WalletTransaction/User.walletBalance relationship from Phase 5a.
const loyaltyTransactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User is required'],
        index: true,
    },

    type: {
        type: String,
        enum: ['earn', 'redeem', 'admin_adjustment'],
        required: true,
    },

    // Always positive; direction is `type`.
    points: {
        type: Number,
        required: true,
        min: 0,
    },

    // Snapshot of User.loyaltyPoints immediately after this transaction, for
    // statement display without recomputing from the ledger.
    pointsBalanceAfter: {
        type: Number,
        required: true,
        min: 0,
    },

    source: {
        type: String,
        enum: ['booking_completed', 'redemption', 'admin_adjustment'],
        required: true,
    },

    description: String,

    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
    },
}, {
    timestamps: true,
});

loyaltyTransactionSchema.index({ user: 1, createdAt: -1 });

const LoyaltyTransaction = mongoose.model('LoyaltyTransaction', loyaltyTransactionSchema);

module.exports = LoyaltyTransaction;
