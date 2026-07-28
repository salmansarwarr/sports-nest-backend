const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Court = require('../models/Court');
const Venue = require('../models/Venue');
const { validationResult } = require('express-validator');

// Returns the list of court IDs a non-admin user is allowed to see analytics
// for (owner/manager of the court itself, or of the venue it belongs to).
// Returns null for admins, meaning "no restriction".
async function getScopedCourtIds(user) {
    if (user.role === 'admin') {
        return null;
    }

    const venues = await Venue.find({ $or: [{ owner: user._id }, { managers: user._id }] }).select('_id').lean();
    const venueIds = venues.map(v => v._id);

    const courts = await Court.find({
        $or: [{ owner: user._id }, { managers: user._id }, { venue: { $in: venueIds } }]
    }).select('_id').lean();

    return courts.map(c => c._id);
}

function buildDateMatch(startDate, endDate, field = 'startTime') {
    if (!startDate && !endDate) return {};
    const range = {};
    if (startDate) range.$gte = new Date(startDate);
    if (endDate) range.$lte = new Date(endDate);
    return { [field]: range };
}

/**
 * @desc    Revenue over time, scoped to the caller's courts
 * @route   GET /api/analytics/revenue
 * @access  Private (Owner/Manager/Admin)
 */
exports.getRevenue = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { startDate, endDate, groupBy = 'day', court, venue } = req.query;
        const courtIds = await getScopedCourtIds(req.user);

        const match = { isPaid: true, ...buildDateMatch(startDate, endDate) };
        if (courtIds) match.court = { $in: courtIds };
        if (court) match.court = new mongoose.Types.ObjectId(court);
        if (venue) match.venue = new mongoose.Types.ObjectId(venue);

        const dateFormat = { day: '%Y-%m-%d', week: '%Y-%U', month: '%Y-%m' }[groupBy] || '%Y-%m-%d';

        const timeline = await Booking.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $dateToString: { format: dateFormat, date: '$startTime' } },
                    revenue: { $sum: '$pricing.totalAmount' },
                    refunded: { $sum: '$payment.refundAmount' },
                    bookings: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const [totals] = await Booking.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$pricing.totalAmount' },
                    totalRefunded: { $sum: '$payment.refundAmount' },
                    totalBookings: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                timeline,
                totals: totals || { totalRevenue: 0, totalRefunded: 0, totalBookings: 0 }
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Occupancy rate per court over a date range
 * @route   GET /api/analytics/occupancy
 * @access  Private (Owner/Manager/Admin)
 */
exports.getOccupancy = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { startDate, endDate, court } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'startDate and endDate are required'
            });
        }

        const courtIds = await getScopedCourtIds(req.user);

        const courtQuery = {};
        if (court) courtQuery._id = court;
        else if (courtIds) courtQuery._id = { $in: courtIds };

        const courts = await Court.find(courtQuery).select('name operatingHours').lean();

        const match = {
            status: { $in: ['confirmed', 'in-progress', 'completed'] },
            startTime: { $gte: new Date(startDate), $lte: new Date(endDate) },
            court: { $in: courts.map(c => c._id) }
        };

        const bookedByCourt = await Booking.aggregate([
            { $match: match },
            { $group: { _id: '$court', bookedMinutes: { $sum: '$duration' } } }
        ]);

        const start = new Date(startDate);
        const end = new Date(endDate);
        const totalDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

        const results = courts.map((c) => {
            const bookedEntry = bookedByCourt.find(b => b._id.toString() === c._id.toString());
            const bookedMinutes = bookedEntry ? bookedEntry.bookedMinutes : 0;

            // Sum available minutes per operating-hours entry for each weekday
            // that occurs within the date range - same per-weekday approach
            // already used by Booking.findAvailableSlots.
            let availableMinutes = 0;
            for (let i = 0; i < totalDays; i++) {
                const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
                const dayOfWeek = day.getDay();
                const hours = c.operatingHours.find(oh => oh.dayOfWeek === dayOfWeek);
                if (hours && !hours.isClosed) {
                    const [openH, openM] = hours.openTime.split(':').map(Number);
                    const [closeH, closeM] = hours.closeTime.split(':').map(Number);
                    availableMinutes += (closeH * 60 + closeM) - (openH * 60 + openM);
                }
            }

            return {
                court: c._id,
                courtName: c.name,
                bookedMinutes,
                availableMinutes,
                occupancyRate: availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 1000) / 10 : 0
            };
        });

        res.status(200).json({
            success: true,
            data: results
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Most-booked courts, scoped to the caller's courts
 * @route   GET /api/analytics/popular-courts
 * @access  Private (Owner/Manager/Admin)
 */
exports.getPopularCourts = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { startDate, endDate, limit = 10 } = req.query;
        const courtIds = await getScopedCourtIds(req.user);

        const match = {
            status: { $nin: ['cancelled', 'expired', 'waitlisted'] },
            ...buildDateMatch(startDate, endDate)
        };
        if (courtIds) match.court = { $in: courtIds };

        const popular = await Booking.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$court',
                    bookingCount: { $sum: 1 },
                    revenue: { $sum: '$pricing.totalAmount' }
                }
            },
            { $sort: { bookingCount: -1 } },
            { $limit: Math.min(parseInt(limit), 50) },
            {
                $lookup: {
                    from: 'courts',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'court'
                }
            },
            { $unwind: '$court' },
            {
                $project: {
                    _id: 0,
                    court: { _id: '$court._id', name: '$court.name', sportType: '$court.sportType' },
                    bookingCount: 1,
                    revenue: 1
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: popular
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Booking status breakdown and daily trend, scoped to the caller's courts
 * @route   GET /api/analytics/bookings-summary
 * @access  Private (Owner/Manager/Admin)
 */
exports.getBookingsSummary = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { startDate, endDate } = req.query;
        const courtIds = await getScopedCourtIds(req.user);

        const match = buildDateMatch(startDate, endDate, 'createdAt');
        if (courtIds) match.court = { $in: courtIds };

        const statusBreakdown = await Booking.aggregate([
            { $match: match },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const trend = await Booking.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const [totals] = await Booking.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalBookings: { $sum: 1 },
                    avgBookingValue: { $avg: '$pricing.totalAmount' }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                statusBreakdown,
                trend,
                totals: totals || { totalBookings: 0, avgBookingValue: 0 }
            }
        });
    } catch (error) {
        next(error);
    }
};
