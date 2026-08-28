const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Court = require('../models/Court');
const Venue = require('../models/Venue');
const { validationResult } = require('express-validator');
const auditLog = require('../utils/auditLog');

// Shared by replyToReview and reportReview: is this user the owner/manager
// of the reviewed court or its parent venue (or an admin)?
function isCourtOrVenueStaff(user, court, venue) {
    return Boolean(
        (court && court.owner.toString() === user._id.toString()) ||
        (venue && venue.owner.toString() === user._id.toString()) ||
        (court && court.managers.some(m => m.toString() === user._id.toString())) ||
        (venue && venue.managers.some(m => m.toString() === user._id.toString())) ||
        user.role === 'admin'
    );
}

/**
 * @desc    Create a review for a completed or cancelled booking
 * @route   POST /api/reviews
 * @access  Private
 */
exports.createReview = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { booking: bookingId, rating, comment, photos } = req.body;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        if (booking.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to review this booking'
            });
        }

        if (booking.status !== 'completed' && booking.status !== 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Only completed or cancelled bookings can be reviewed'
            });
        }

        if (booking.isReviewed) {
            return res.status(400).json({
                success: false,
                message: 'This booking has already been reviewed'
            });
        }

        const review = await Review.create({
            user: req.user._id,
            court: booking.court,
            venue: booking.venue,
            booking: booking._id,
            rating,
            comment,
            photos
        });

        booking.review = review._id;
        booking.rating = rating;
        booking.isReviewed = true;
        await booking.save();

        await Review.recalculateCourtStats(booking.court);

        res.status(201).json({
            success: true,
            message: 'Review submitted successfully',
            data: review
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get reviews with filtering
 * @route   GET /api/reviews
 * @access  Public
 */
exports.getReviews = async (req, res, next) => {
    try {
        const {
            court,
            venue,
            user,
            status,
            reported,
            sortBy = '-createdAt',
            page = 1,
            limit = 20,
        } = req.query;

        const query = {};

        if (court) query.court = court;
        if (venue) query.venue = venue;
        if (user) query.user = user;

        const isAdmin = req.user && req.user.role === 'admin';

        if (isAdmin) {
            // Admins can see reviews of any status; leaving `status` off
            // returns every status, not just approved ones.
            if (status) query.status = status;
            if (reported === 'true') query['report.isReported'] = true;
        } else {
            // Only admins can filter by/see non-approved or reported-only reviews
            query.status = 'approved';
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const reviews = await Review.find(query)
            .populate('user', 'firstName lastName profilePicture')
            .populate('court', 'name')
            .sort(sortBy)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await Review.countDocuments(query);

        res.status(200).json({
            success: true,
            count: reviews.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: reviews
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get single review
 * @route   GET /api/reviews/:id
 * @access  Public
 */
exports.getReview = async (req, res, next) => {
    try {
        const review = await Review.findById(req.params.id)
            .populate('user', 'firstName lastName profilePicture')
            .populate('court', 'name');

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        res.status(200).json({
            success: true,
            data: review
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update own review
 * @route   PUT /api/reviews/:id
 * @access  Private (Review author)
 */
exports.updateReview = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        if (review.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this review'
            });
        }

        const { rating, comment } = req.body;
        if (rating !== undefined) review.rating = rating;
        if (comment !== undefined) review.comment = comment;

        await review.save();

        if (rating !== undefined) {
            await Review.recalculateCourtStats(review.court);
        }

        res.status(200).json({
            success: true,
            message: 'Review updated successfully',
            data: review
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete own review (or admin)
 * @route   DELETE /api/reviews/:id
 * @access  Private (Review author/Admin)
 */
exports.deleteReview = async (req, res, next) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        const isAuthor = review.user.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this review'
            });
        }

        await Booking.findByIdAndUpdate(review.booking, {
            $unset: { review: '', rating: '' },
            isReviewed: false
        });

        const { court } = review;
        await review.deleteOne();

        await Review.recalculateCourtStats(court);

        res.status(200).json({
            success: true,
            message: 'Review deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Reply to a review (court/venue owner or manager)
 * @route   POST /api/reviews/:id/reply
 * @access  Private (Owner/Manager/Admin)
 */
exports.replyToReview = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        const court = await Court.findById(review.court);
        const venue = await Venue.findById(review.venue);

        if (!isCourtOrVenueStaff(req.user, court, venue)) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to reply to this review'
            });
        }

        review.ownerReply = {
            text: req.body.text,
            repliedBy: req.user._id,
            repliedAt: new Date()
        };

        await review.save();

        res.status(200).json({
            success: true,
            message: 'Reply added successfully',
            data: review
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Report a review as offensive/inappropriate for admin review
 *          (court/venue owner or manager)
 * @route   POST /api/reviews/:id/report
 * @access  Private (Owner/Manager/Admin)
 */
exports.reportReview = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        const court = await Court.findById(review.court);
        const venue = await Venue.findById(review.venue);

        if (!isCourtOrVenueStaff(req.user, court, venue)) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to report this review'
            });
        }

        review.report = {
            isReported: true,
            reason: req.body.reason,
            reportedBy: req.user._id,
            reportedAt: new Date()
        };

        await review.save();

        await auditLog.record({
            actor: req.user,
            action: 'review.reported',
            resourceType: 'Review',
            resourceId: review._id,
            changes: { reason: req.body.reason },
            req
        });

        res.status(200).json({
            success: true,
            message: 'Review reported to admin for take-down review',
            data: review
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Moderate a review (approve/reject)
 * @route   PUT /api/reviews/:id/moderate
 * @access  Private (Admin)
 */
exports.moderateReview = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        review.status = req.body.status;
        review.moderationReason = req.body.moderationReason;
        review.moderatedBy = req.user._id;
        review.moderatedAt = new Date();

        // A moderation action resolves any pending report — keep the
        // reason/reporter/date for the audit trail, just drop it out of the
        // "reported" admin queue.
        if (review.report?.isReported) {
            review.report.isReported = false;
        }

        await review.save();
        await Review.recalculateCourtStats(review.court);

        await auditLog.record({
            actor: req.user,
            action: 'review.moderated',
            resourceType: 'Review',
            resourceId: review._id,
            changes: { status: review.status, moderationReason: review.moderationReason },
            req
        });

        res.status(200).json({
            success: true,
            message: 'Review moderated successfully',
            data: review
        });
    } catch (error) {
        next(error);
    }
};
