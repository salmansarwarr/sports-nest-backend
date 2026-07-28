const mongoose = require('mongoose');

// Append-only ledger for wallet balance changes. User.walletBalance is a
// denormalized cache of the running total, kept in sync atomically by
// User.creditWallet/debitWallet - this collection is the audit trail, not
// the source of truth for reads (summing on every booking would be an
// unnecessary aggregation on the hot path).
const walletTransactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User is required'],
        index: true,
    },

    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true,
    },

    // Always positive; direction is `type`.
    amount: {
        type: Number,
        required: true,
        min: 0,
    },

    // Snapshot of User.walletBalance immediately after this transaction, for
    // statement display without recomputing from the ledger.
    balanceAfter: {
        type: Number,
        required: true,
        min: 0,
    },

    // 'loyalty_redemption' and 'referral_bonus' are consumed by later
    // sub-phases but declared here upfront to avoid a second schema-touching
    // migration.
    source: {
        type: String,
        enum: ['booking_payment', 'refund', 'admin_adjustment', 'loyalty_redemption', 'referral_bonus', 'top_up'],
        required: true,
    },

    description: String,

    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
    },

    // Set for source:'top_up' entries so the webhook handler can guard
    // against double-crediting on a retried Stripe event.
    gatewayPaymentIntentId: {
        type: String,
        index: true,
    },
}, {
    timestamps: true,
});

walletTransactionSchema.index({ user: 1, createdAt: -1 });

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);

module.exports = WalletTransaction;
