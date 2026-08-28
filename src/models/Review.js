const mongoose = require('mongoose');

const ownerReplySchema = new mongoose.Schema({
    text: {
        type: String,
        required: true,
        maxlength: [1000, 'Reply cannot exceed 1000 characters'],
    },
    repliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    repliedAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

// A venue owner/manager flagging a review as offensive/abusive for admin
// review. isReported flips back to false once an admin acts on it
// (moderateReview), but reason/reportedBy/reportedAt are kept for the audit
// trail rather than cleared.
const reportSchema = new mongoose.Schema({
    isReported: {
        type: Boolean,
        default: false,
    },
    reason: {
        type: String,
        maxlength: [500, 'Report reason cannot exceed 500 characters'],
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    reportedAt: Date,
}, { _id: false });

const reviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User is required'],
        index: true,
    },

    court: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Court',
        required: [true, 'Court is required'],
        index: true,
    },

    venue: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Venue',
        required: [true, 'Venue is required'],
        index: true,
    },

    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: [true, 'A completed booking is required to leave a review'],
        unique: true,
    },

    rating: {
        type: Number,
        required: [true, 'Rating is required'],
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5'],
    },

    comment: {
        type: String,
        trim: true,
        maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    },

    photos: [{
        url: { type: String, required: true },
        publicId: String,
    }],

    ownerReply: ownerReplySchema,

    report: reportSchema,

    status: {
        type: String,
        enum: ['approved', 'pending', 'rejected'],
        default: 'approved',
        index: true,
    },

    moderatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    moderatedAt: Date,

    moderationReason: String,

}, {
    timestamps: true,
});

reviewSchema.index({ court: 1, status: 1 });
reviewSchema.index({ venue: 1, status: 1 });
reviewSchema.index({ 'report.isReported': 1 });

// Recalculate a court's aggregate rating/review count from its approved reviews,
// then propagate to the parent venue (Venue.updateStats reads from Court.stats).
reviewSchema.statics.recalculateCourtStats = async function (courtId) {
    const Court = mongoose.model('Court');

    const [result] = await this.aggregate([
        { $match: { court: new mongoose.Types.ObjectId(courtId), status: 'approved' } },
        {
            $group: {
                _id: '$court',
                averageRating: { $avg: '$rating' },
                totalReviews: { $sum: 1 },
            },
        },
    ]);

    const court = await Court.findById(courtId);
    if (!court) return;

    court.stats.averageRating = result ? Math.round(result.averageRating * 10) / 10 : 0;
    court.stats.totalReviews = result ? result.totalReviews : 0;
    await court.save();

    const venue = await mongoose.model('Venue').findById(court.venue);
    if (venue) {
        await venue.updateStats();
    }
};

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
