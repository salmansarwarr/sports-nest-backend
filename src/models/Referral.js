const mongoose = require('mongoose');

// One row per referred signup. referredUser is unique - a user can only
// ever be the "referred" side of one referral, DB-enforced.
const referralSchema = new mongoose.Schema({
    referrer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Referrer is required'],
        index: true,
    },

    referredUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Referred user is required'],
        unique: true,
    },

    // Snapshot of the code used at signup time, for display even if the
    // referrer later regenerates/changes theirs (not currently possible,
    // but avoids coupling this record to User.referralCode's live value).
    referralCode: {
        type: String,
        required: true,
    },

    status: {
        type: String,
        enum: ['pending', 'qualified', 'rewarded'],
        default: 'pending',
    },

    qualifyingBooking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
    },

    referrerReward: Number,
    referredReward: Number,
    rewardedAt: Date,
}, {
    timestamps: true,
});

referralSchema.index({ referrer: 1, createdAt: -1 });

const Referral = mongoose.model('Referral', referralSchema);

module.exports = Referral;
