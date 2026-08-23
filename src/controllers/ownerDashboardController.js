const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Court = require('../models/Court');
const Venue = require('../models/Venue');
const Review = require('../models/Review');

/**
 * Helper to get venues and courts belonging to the authenticated owner/manager.
 */
async function getOwnerScopedEntities(userId, userRole) {
    if (userRole === 'admin') {
        const venues = await Venue.find({ status: { $ne: 'deleted' } }).select('_id name').lean();
        const venueIds = venues.map(v => v._id);
        const courts = await Court.find({ status: { $ne: 'deleted' } }).select('_id name venue').lean();
        const courtIds = courts.map(c => c._id);
        return { venues, venueIds, courts, courtIds };
    }

    const venues = await Venue.find({
        $or: [{ owner: userId }, { managers: userId }],
        status: { $ne: 'deleted' },
    }).select('_id name').lean();

    const venueIds = venues.map(v => v._id);

    const courts = await Court.find({
        $or: [{ owner: userId }, { managers: userId }, { venue: { $in: venueIds } }],
        status: { $ne: 'deleted' },
    }).select('_id name venue').lean();

    const courtIds = courts.map(c => c._id);

    return { venues, venueIds, courts, courtIds };
}

/**
 * Parse date range helper
 */
function parseRangeDates(query) {
    const now = new Date();
    let currentEnd = new Date(now);
    let currentStart = new Date(now);

    const range = query.range || '30d';

    if (query.startDate && query.endDate) {
        currentStart = new Date(query.startDate);
        currentEnd = new Date(query.endDate);
    } else {
        switch (range) {
            case '7d':
                currentStart.setDate(now.getDate() - 7);
                break;
            case '90d':
                currentStart.setDate(now.getDate() - 90);
                break;
            case 'this_month':
                currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'last_month':
                currentStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                currentEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                break;
            case '30d':
            default:
                currentStart.setDate(now.getDate() - 30);
                break;
        }
    }

    const durationMs = currentEnd.getTime() - currentStart.getTime();
    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - durationMs);

    return { currentStart, currentEnd, previousStart, previousEnd };
}

function calcPctChange(current, previous) {
    if (!previous || previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
}

/**
 * GET /api/owner/dashboard
 * Consolidated dashboard analytics for venue owners.
 */
exports.getOwnerDashboardMetrics = async (req, res, next) => {
    try {
        const { currentStart, currentEnd, previousStart, previousEnd } = parseRangeDates(req.query);
        const { venueIds, courtIds } = await getOwnerScopedEntities(req.user._id, req.user.role);

        if (courtIds.length === 0 && venueIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    kpis: {
                        totalRevenue: { value: 0, previousValue: 0, pctChange: 0 },
                        totalBookings: { value: 0, previousValue: 0, pctChange: 0 },
                        completedBookings: { value: 0 },
                        pendingBookings: { value: 0 },
                        cancelledBookings: { value: 0 },
                        totalVenues: { value: 0 },
                        totalCourts: { value: 0 },
                        avgRating: { value: 0, totalReviews: 0 },
                    },
                    trends: { daily: [] },
                    distributions: { bookingStatus: {}, popularCourts: [], popularVenues: [] },
                    recentBookings: [],
                },
            });
        }

        // 1. Overall System Counts for Owner
        const [totalVenues, totalCourts, reviewsData] = await Promise.all([
            Venue.countDocuments({ _id: { $in: venueIds }, status: { $ne: 'deleted' } }),
            Court.countDocuments({ _id: { $in: courtIds }, status: { $ne: 'deleted' } }),
            Review.aggregate([
                { $match: { venue: { $in: venueIds } } },
                { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
            ]),
        ]);

        const avgRating = reviewsData.length > 0 ? parseFloat(reviewsData[0].avgRating.toFixed(1)) : 0;
        const totalReviews = reviewsData.length > 0 ? reviewsData[0].count : 0;

        // 2. Current vs Previous Period Bookings & Revenue
        const bookingMatchBase = {
            $or: [{ court: { $in: courtIds } }, { venue: { $in: venueIds } }],
        };

        const [
            currentBookingsCount,
            previousBookingsCount,
            currentCompletedCount,
            currentPendingCount,
            currentCancelledCount,
            currentRevenueAgg,
            previousRevenueAgg,
        ] = await Promise.all([
            Booking.countDocuments({ ...bookingMatchBase, createdAt: { $gte: currentStart, $lte: currentEnd } }),
            Booking.countDocuments({ ...bookingMatchBase, createdAt: { $gte: previousStart, $lte: previousEnd } }),
            Booking.countDocuments({ ...bookingMatchBase, createdAt: { $gte: currentStart, $lte: currentEnd }, status: 'completed' }),
            Booking.countDocuments({ ...bookingMatchBase, createdAt: { $gte: currentStart, $lte: currentEnd }, status: { $in: ['pending-confirmation', 'confirmed'] } }),
            Booking.countDocuments({ ...bookingMatchBase, createdAt: { $gte: currentStart, $lte: currentEnd }, status: 'cancelled' }),
            Booking.aggregate([
                {
                    $match: {
                        ...bookingMatchBase,
                        createdAt: { $gte: currentStart, $lte: currentEnd },
                        status: { $in: ['confirmed', 'completed', 'in-progress'] },
                    },
                },
                { $group: { _id: null, total: { $sum: { $ifNull: ['$payment.amount', { $ifNull: ['$paymentInfo.amount', '$pricing.totalAmount'] }] } } } },
            ]),
            Booking.aggregate([
                {
                    $match: {
                        ...bookingMatchBase,
                        createdAt: { $gte: previousStart, $lte: previousEnd },
                        status: { $in: ['confirmed', 'completed', 'in-progress'] },
                    },
                },
                { $group: { _id: null, total: { $sum: { $ifNull: ['$payment.amount', { $ifNull: ['$paymentInfo.amount', '$pricing.totalAmount'] }] } } } },
            ]),
        ]);

        const currentRevenue = currentRevenueAgg[0]?.total || 0;
        const previousRevenue = previousRevenueAgg[0]?.total || 0;

        const kpis = {
            totalRevenue: {
                value: currentRevenue,
                previousValue: previousRevenue,
                pctChange: calcPctChange(currentRevenue, previousRevenue),
            },
            totalBookings: {
                value: currentBookingsCount,
                previousValue: previousBookingsCount,
                pctChange: calcPctChange(currentBookingsCount, previousBookingsCount),
            },
            completedBookings: { value: currentCompletedCount },
            pendingBookings: { value: currentPendingCount },
            cancelledBookings: { value: currentCancelledCount },
            totalVenues: { value: totalVenues },
            totalCourts: { value: totalCourts },
            avgRating: { value: avgRating, totalReviews },
        };

        // 3. Time-Series Trends (Daily)
        const dailyTrends = await Booking.aggregate([
            {
                $match: {
                    ...bookingMatchBase,
                    createdAt: { $gte: currentStart, $lte: currentEnd },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                    revenue: {
                        $sum: {
                            $cond: [
                                { $in: ['$status', ['confirmed', 'completed', 'in-progress']] },
                                { $ifNull: ['$payment.amount', { $ifNull: ['$paymentInfo.amount', '$pricing.totalAmount'] }] },
                                0,
                            ],
                        },
                    },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // 4. Booking Status Ratio
        const bookingStatusAgg = await Booking.aggregate([
            {
                $match: {
                    ...bookingMatchBase,
                    createdAt: { $gte: currentStart, $lte: currentEnd },
                },
            },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        const bookingStatusDistribution = bookingStatusAgg.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {});

        // 5. Popular Performing Courts & Venues
        const popularCourts = await Booking.aggregate([
            {
                $match: {
                    ...bookingMatchBase,
                    createdAt: { $gte: currentStart, $lte: currentEnd },
                },
            },
            {
                $group: {
                    _id: '$court',
                    bookingCount: { $sum: 1 },
                    totalRevenue: {
                        $sum: {
                            $cond: [
                                { $in: ['$status', ['confirmed', 'completed', 'in-progress']] },
                                { $ifNull: ['$payment.amount', { $ifNull: ['$paymentInfo.amount', '$pricing.totalAmount'] }] },
                                0,
                            ],
                        },
                    },
                },
            },
            { $sort: { bookingCount: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'courts',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'courtInfo',
                },
            },
            { $unwind: { path: '$courtInfo', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'venues',
                    localField: 'courtInfo.venue',
                    foreignField: '_id',
                    as: 'venueInfo',
                },
            },
            { $unwind: { path: '$venueInfo', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    courtId: '$_id',
                    courtName: '$courtInfo.name',
                    sport: '$courtInfo.sportType',
                    venueName: '$venueInfo.name',
                    bookingCount: 1,
                    totalRevenue: 1,
                },
            },
        ]);

        // 6. Recent Bookings for Owner
        const recentBookings = await Booking.find(bookingMatchBase)
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'firstName lastName email')
            .populate('court', 'name sportType')
            .populate('venue', 'name')
            .lean();

        res.status(200).json({
            success: true,
            data: {
                kpis,
                trends: { daily: dailyTrends },
                distributions: {
                    bookingStatus: bookingStatusDistribution,
                    popularCourts,
                },
                recentBookings,
            },
        });
    } catch (error) {
        next(error);
    }
};
