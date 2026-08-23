const Booking = require('../models/Booking');
const User = require('../models/User');
const Venue = require('../models/Venue');
const Court = require('../models/Court');
const Review = require('../models/Review');
const SupportTicket = require('../models/SupportTicket');
const WalletTransaction = require('../models/WalletTransaction');

/**
 * Calculates start and end dates based on string range or custom dates.
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
            case 'today':
                currentStart.setHours(0, 0, 0, 0);
                currentEnd.setHours(23, 59, 59, 999);
                break;
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

    // Previous period of equal duration
    const durationMs = currentEnd.getTime() - currentStart.getTime();
    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - durationMs);

    return { currentStart, currentEnd, previousStart, previousEnd };
}

/**
 * Helper to calculate percentage change
 */
function calcPctChange(current, previous) {
    if (!previous || previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
}

/**
 * GET /api/admin/dashboard
 * Aggregates all KPI metrics, trend time-series, categorical distributions, and operational activity.
 */
exports.getAdminDashboardMetrics = async (req, res, next) => {
    try {
        const { currentStart, currentEnd, previousStart, previousEnd } = parseRangeDates(req.query);

        // 1. Overall System Total Counts (All Time)
        const [totalUsers, totalVenues, totalCourts, totalReviewsData, openSupportTicketsCount] = await Promise.all([
            User.countDocuments({ status: { $ne: 'deleted' } }),
            Venue.countDocuments({ status: { $ne: 'deleted' } }),
            Court.countDocuments({ status: { $ne: 'deleted' } }),
            Review.aggregate([
                { $match: { isPublished: { $ne: false } } },
                { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
            ]),
            SupportTicket.countDocuments({ status: { $in: ['open', 'in-progress'] } }),
        ]);

        const avgRating = totalReviewsData.length > 0 ? parseFloat(totalReviewsData[0].avgRating.toFixed(1)) : 0;
        const totalReviewsCount = totalReviewsData.length > 0 ? totalReviewsData[0].count : 0;

        // 2. Current Period vs Previous Period KPI Calculations
        const [
            currentBookingsCount,
            previousBookingsCount,
            currentCompletedCount,
            previousCompletedCount,
            currentCancelledCount,
            previousCancelledCount,
            currentRevenueAgg,
            previousRevenueAgg,
            newUsersCurrentCount,
            newUsersPreviousCount,
        ] = await Promise.all([
            Booking.countDocuments({ createdAt: { $gte: currentStart, $lte: currentEnd } }),
            Booking.countDocuments({ createdAt: { $gte: previousStart, $lte: previousEnd } }),
            Booking.countDocuments({ createdAt: { $gte: currentStart, $lte: currentEnd }, status: 'completed' }),
            Booking.countDocuments({ createdAt: { $gte: previousStart, $lte: previousEnd }, status: 'completed' }),
            Booking.countDocuments({ createdAt: { $gte: currentStart, $lte: currentEnd }, status: 'cancelled' }),
            Booking.countDocuments({ createdAt: { $gte: previousStart, $lte: previousEnd }, status: 'cancelled' }),
            Booking.aggregate([
                {
                    $match: {
                        createdAt: { $gte: currentStart, $lte: currentEnd },
                        status: { $in: ['confirmed', 'completed', 'in-progress'] },
                    },
                },
                { $group: { _id: null, total: { $sum: { $ifNull: ['$payment.amount', { $ifNull: ['$paymentInfo.amount', '$pricing.totalAmount'] }] } } } },
            ]),
            Booking.aggregate([
                {
                    $match: {
                        createdAt: { $gte: previousStart, $lte: previousEnd },
                        status: { $in: ['confirmed', 'completed', 'in-progress'] },
                    },
                },
                { $group: { _id: null, total: { $sum: { $ifNull: ['$payment.amount', { $ifNull: ['$paymentInfo.amount', '$pricing.totalAmount'] }] } } } },
            ]),
            User.countDocuments({ createdAt: { $gte: currentStart, $lte: currentEnd } }),
            User.countDocuments({ createdAt: { $gte: previousStart, $lte: previousEnd } }),
        ]);

        const currentRevenue = currentRevenueAgg[0]?.total || 0;
        const previousRevenue = previousRevenueAgg[0]?.total || 0;

        const kpis = {
            totalUsers: {
                value: totalUsers,
                newInPeriod: newUsersCurrentCount,
                pctChange: calcPctChange(newUsersCurrentCount, newUsersPreviousCount),
            },
            totalVenues: { value: totalVenues },
            totalCourts: { value: totalCourts },
            totalBookings: {
                value: currentBookingsCount,
                previousValue: previousBookingsCount,
                pctChange: calcPctChange(currentBookingsCount, previousBookingsCount),
            },
            completedBookings: {
                value: currentCompletedCount,
                previousValue: previousCompletedCount,
                pctChange: calcPctChange(currentCompletedCount, previousCompletedCount),
            },
            cancelledBookings: {
                value: currentCancelledCount,
                previousValue: previousCancelledCount,
                pctChange: calcPctChange(currentCancelledCount, previousCancelledCount),
            },
            totalRevenue: {
                value: currentRevenue,
                previousValue: previousRevenue,
                pctChange: calcPctChange(currentRevenue, previousRevenue),
            },
            avgRating: { value: avgRating, totalReviews: totalReviewsCount },
            openSupportTickets: { value: openSupportTicketsCount },
        };

        // 3. Time-Series Trends Aggregation (Daily resolution)
        const bookingTrendAgg = await Booking.aggregate([
            { $match: { createdAt: { $gte: currentStart, $lte: currentEnd } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    total: { $sum: 1 },
                    completed: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                    },
                    cancelled: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
                    },
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

        const userGrowthTrendAgg = await User.aggregate([
            { $match: { createdAt: { $gte: currentStart, $lte: currentEnd } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    users: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // 4. Booking Status Distribution
        const bookingStatusAgg = await Booking.aggregate([
            { $match: { createdAt: { $gte: currentStart, $lte: currentEnd } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        const bookingStatusDistribution = bookingStatusAgg.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {});

        // 5. Popular Performing Courts
        const popularCourts = await Booking.aggregate([
            { $match: { createdAt: { $gte: currentStart, $lte: currentEnd } } },
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
                    sport: '$courtInfo.sport',
                    venueName: '$venueInfo.name',
                    bookingCount: 1,
                    totalRevenue: 1,
                },
            },
        ]);

        // 6. Recent Activity Lists
        const [recentBookings, recentUsers, recentTickets] = await Promise.all([
            Booking.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('user', 'firstName lastName email')
                .populate('court', 'name sport')
                .populate('venue', 'name')
                .lean(),
            User.find({ status: { $ne: 'deleted' } })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('firstName lastName email role createdAt')
                .lean(),
            SupportTicket.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('user', 'firstName lastName email')
                .lean(),
        ]);

        res.status(200).json({
            success: true,
            data: {
                rangeInfo: {
                    currentStart,
                    currentEnd,
                    previousStart,
                    previousEnd,
                },
                kpis,
                trends: {
                    daily: bookingTrendAgg,
                    userGrowth: userGrowthTrendAgg,
                },
                distributions: {
                    bookingStatus: bookingStatusDistribution,
                    popularCourts,
                },
                recent: {
                    bookings: recentBookings,
                    users: recentUsers,
                    tickets: recentTickets,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};
