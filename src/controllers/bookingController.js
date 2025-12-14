const Booking = require('../models/Booking');
const Court = require('../models/Court');
const Venue = require('../models/Venue');
const { validationResult } = require('express-validator');

/**
 * @desc    Create a new booking
 * @route   POST /api/bookings
 * @access  Private
 */
exports.createBooking = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { court, startTime, endTime, bookingType, recurringPattern, ...bookingData } = req.body;

        // Verify court exists and is active
        const courtDoc = await Court.findById(court).populate('venue');
        if (!courtDoc) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        if (courtDoc.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'Court is not available for booking'
            });
        }

        // Verify booking duration meets requirements
        const duration = (new Date(endTime) - new Date(startTime)) / (1000 * 60); // in minutes
        if (duration < courtDoc.bookingSettings.minBookingDuration) {
            return res.status(400).json({
                success: false,
                message: `Minimum booking duration is ${courtDoc.bookingSettings.minBookingDuration} minutes`
            });
        }

        if (duration > courtDoc.bookingSettings.maxBookingDuration) {
            return res.status(400).json({
                success: false,
                message: `Maximum booking duration is ${courtDoc.bookingSettings.maxBookingDuration} minutes`
            });
        }

        // Check if court is available for the time slot
        const availability = await courtDoc.isAvailableForSlot(startTime, endTime);
        if (!availability.available) {
            return res.status(400).json({
                success: false,
                message: availability.reason || 'Court is not available for selected time slot'
            });
        }

        // Check for booking conflicts
        const conflicts = await Booking.checkConflicts(court, startTime, endTime);
        if (conflicts.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Time slot is already booked',
                conflicts: conflicts.map(c => ({
                    bookingNumber: c.bookingNumber,
                    startTime: c.startTime,
                    endTime: c.endTime,
                    status: c.status
                }))
            });
        }

        // Check user's concurrent booking limit
        const userActiveBookings = await Booking.countDocuments({
            user: req.user._id,
            court: court,
            status: { $in: ['confirmed', 'pending-confirmation'] }
        });

        if (userActiveBookings >= courtDoc.bookingSettings.maxConcurrentBookingsPerUser) {
            return res.status(400).json({
                success: false,
                message: `You have reached the maximum limit of ${courtDoc.bookingSettings.maxConcurrentBookingsPerUser} concurrent bookings for this court`
            });
        }

        // Calculate pricing
        const basePrice = courtDoc.calculatePrice(startTime, endTime, {
            membershipTier: req.user.membershipTier,
            groupSize: bookingData.groupSize || 1,
            isEarlyBird: bookingData.isEarlyBird
        });

        // Apply discounts if any
        let totalDiscount = 0;
        const discounts = [];

        if (bookingData.couponCode) {
            // TODO: Apply coupon discount
            // This will be implemented in promotional system
        }

        const subtotal = basePrice - totalDiscount;
        const tax = subtotal * 0.05; // 5% tax (can be configured)
        const serviceFee = 0; // Can be configured
        const totalAmount = subtotal + tax + serviceFee;

        // Prepare booking data
        const booking = new Booking({
            user: req.user._id,
            court: court,
            venue: courtDoc.venue._id,
            startTime,
            endTime,
            bookingType: bookingType || 'single',
            pricing: {
                basePrice,
                discounts,
                totalDiscount,
                subtotal,
                tax,
                serviceFee,
                totalAmount,
                currency: courtDoc.currency
            },
            payment: {
                amount: totalAmount,
                currency: courtDoc.currency,
                status: 'pending'
            },
            requiresApproval: courtDoc.bookingSettings.requiresApproval || courtDoc.venue.settings.requiresApproval,
            status: (courtDoc.bookingSettings.requiresApproval || courtDoc.venue.settings.requiresApproval)
                ? 'pending-confirmation'
                : 'confirmed',
            source: req.body.source || 'web',
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            ...bookingData
        });

        // Handle recurring bookings
        if (bookingType === 'recurring' && recurringPattern) {
            if (!courtDoc.bookingSettings.allowRecurringBookings) {
                return res.status(400).json({
                    success: false,
                    message: 'Recurring bookings are not allowed for this court'
                });
            }

            // Validate recurring pattern
            if (!recurringPattern.frequency || (!recurringPattern.endDate && !recurringPattern.occurrences)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid recurring pattern. Must specify frequency and either endDate or occurrences'
                });
            }

            booking.recurringPattern = recurringPattern;

            // Create the parent booking first
            await booking.save();

            // Generate recurring bookings
            const recurringBookings = await generateRecurringBookings(booking, courtDoc);

            // Update parent booking with references
            booking.recurringBookings = recurringBookings.map(b => b._id);
            await booking.save();

            return res.status(201).json({
                success: true,
                message: 'Recurring booking created successfully',
                data: {
                    parentBooking: booking,
                    recurringBookings,
                    totalBookings: recurringBookings.length + 1
                }
            });
        }

        await booking.save();

        // Update court statistics
        courtDoc.stats.totalBookings += 1;
        await courtDoc.save();

        // Populate references before sending response
        await booking.populate('user court venue');

        res.status(201).json({
            success: true,
            message: booking.requiresApproval
                ? 'Booking created and awaiting approval'
                : 'Booking confirmed successfully',
            data: booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all bookings with filtering
 * @route   GET /api/bookings
 * @access  Private
 */
exports.getBookings = async (req, res, next) => {
    try {
        const {
            status,
            court,
            venue,
            startDate,
            endDate,
            user,
            bookingType,
            isPaid,
            sortBy = '-createdAt',
            page = 1,
            limit = 20,
        } = req.query;

        // Build query
        const query = {};

        // Only admins and venue owners can see all bookings
        if (req.user.role !== 'admin') {
            // Regular users can only see their own bookings
            if (!court && !venue) {
                query.user = req.user._id;
            } else {
                // If filtering by court/venue, check if user is owner/manager
                if (court) {
                    const courtDoc = await Court.findById(court).populate('venue');
                    if (courtDoc) {
                        const isOwner = courtDoc.owner.toString() === req.user._id.toString();
                        const isVenueOwner = courtDoc.venue.owner.toString() === req.user._id.toString();
                        const isManager = courtDoc.managers.some(m => m.toString() === req.user._id.toString()) ||
                            courtDoc.venue.managers.some(m => m.toString() === req.user._id.toString());

                        if (!isOwner && !isVenueOwner && !isManager) {
                            query.user = req.user._id;
                        }
                    }
                }
            }
        }

        if (status) {
            query.status = status;
        }

        if (court) {
            query.court = court;
        }

        if (venue) {
            query.venue = venue;
        }

        if (user && req.user.role === 'admin') {
            query.user = user;
        }

        if (bookingType) {
            query.bookingType = bookingType;
        }

        if (isPaid !== undefined) {
            query.isPaid = isPaid === 'true';
        }

        // Date range filter
        if (startDate || endDate) {
            query.startTime = {};
            if (startDate) {
                query.startTime.$gte = new Date(startDate);
            }
            if (endDate) {
                query.startTime.$lte = new Date(endDate);
            }
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Execute query
        const bookings = await Booking.find(query)
            .populate('user', 'firstName lastName email phone')
            .populate('court', 'name courtNumber sportType')
            .populate('venue', 'name address')
            .sort(sortBy)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get total count
        const total = await Booking.countDocuments(query);

        res.status(200).json({
            success: true,
            count: bookings.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: bookings
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get single booking
 * @route   GET /api/bookings/:id
 * @access  Private
 */
exports.getBooking = async (req, res, next) => {
    try {
        let booking;

        // Try to find by booking number first, then by ID
        booking = await Booking.findOne({ bookingNumber: req.params.id })
            .populate('user court venue')
            .populate('approvedBy', 'firstName lastName')
            .populate('participants.user', 'firstName lastName email');

        if (!booking) {
            booking = await Booking.findById(req.params.id)
                .populate('user court venue')
                .populate('approvedBy', 'firstName lastName')
                .populate('participants.user', 'firstName lastName email');
        }

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check authorization
        const isOwner = booking.user._id.toString() === req.user._id.toString();
        const isCourtOwner = booking.court.owner.toString() === req.user._id.toString();
        const isVenueOwner = booking.venue.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isCourtOwner && !isVenueOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this booking'
            });
        }

        res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update booking (reschedule)
 * @route   PUT /api/bookings/:id
 * @access  Private
 */
exports.updateBooking = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        let booking = await Booking.findById(req.params.id).populate('court venue');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check authorization
        const isOwner = booking.user.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this booking'
            });
        }

        // Check if booking can be modified
        const canModify = booking.canBeModified();
        if (!canModify.allowed) {
            return res.status(400).json({
                success: false,
                message: canModify.reason
            });
        }

        const { startTime, endTime, ...otherUpdates } = req.body;

        // If rescheduling (changing time)
        if (startTime || endTime) {
            const newStartTime = startTime ? new Date(startTime) : booking.startTime;
            const newEndTime = endTime ? new Date(endTime) : booking.endTime;

            // Check for conflicts (excluding this booking)
            const conflicts = await Booking.checkConflicts(
                booking.court._id,
                newStartTime,
                newEndTime,
                booking._id
            );

            if (conflicts.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'New time slot is already booked',
                    conflicts: conflicts.map(c => ({
                        bookingNumber: c.bookingNumber,
                        startTime: c.startTime,
                        endTime: c.endTime
                    }))
                });
            }

            // Check court availability
            const availability = await booking.court.isAvailableForSlot(newStartTime, newEndTime);
            if (!availability.available) {
                return res.status(400).json({
                    success: false,
                    message: availability.reason
                });
            }

            // Recalculate pricing if time changed
            const newPrice = booking.court.calculatePrice(newStartTime, newEndTime, {
                membershipTier: req.user.membershipTier,
                groupSize: booking.groupSize
            });

            // Update modification history
            booking.modificationHistory.push({
                modifiedBy: req.user._id,
                changes: {
                    startTime: { from: booking.startTime, to: newStartTime },
                    endTime: { from: booking.endTime, to: newEndTime },
                    price: { from: booking.pricing.totalAmount, to: newPrice }
                },
                reason: req.body.modificationReason || 'Rescheduled'
            });

            booking.startTime = newStartTime;
            booking.endTime = newEndTime;
            booking.pricing.totalAmount = newPrice;
        }

        // Update other fields
        Object.keys(otherUpdates).forEach(key => {
            if (['notes', 'specialRequests', 'groupSize'].includes(key)) {
                booking[key] = otherUpdates[key];
            }
        });

        await booking.save();

        await booking.populate('user court venue');

        res.status(200).json({
            success: true,
            message: 'Booking updated successfully',
            data: booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Cancel booking
 * @route   DELETE /api/bookings/:id
 * @access  Private
 */
exports.cancelBooking = async (req, res, next) => {
    try {
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Cancellation reason is required'
            });
        }

        const booking = await Booking.findById(req.params.id).populate('court venue');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check authorization
        const isOwner = booking.user.toString() === req.user._id.toString();
        const isVenueOwner = booking.venue.owner.toString() === req.user._id.toString();
        const isCourtOwner = booking.court.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isVenueOwner && !isCourtOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to cancel this booking'
            });
        }

        // Check if booking can be cancelled
        const canCancel = booking.canBeCancelled();
        if (!canCancel.allowed) {
            return res.status(400).json({
                success: false,
                message: canCancel.reason
            });
        }

        // Calculate refund
        const refundInfo = booking.calculateCancellationRefund();

        booking.status = 'cancelled';
        booking.cancellation = {
            cancelledAt: new Date(),
            cancelledBy: req.user._id,
            reason,
            ...refundInfo
        };

        // Update payment status if refund is due
        if (refundInfo.refundEligible && booking.isPaid) {
            booking.payment.refundAmount = refundInfo.refundAmount;
            // TODO: Process actual refund through payment gateway
            // booking.payment.status = 'refunded';
        }

        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Booking cancelled successfully',
            data: {
                booking,
                refundInfo
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Check availability for time slot
 * @route   POST /api/bookings/check-availability
 * @access  Public
 */
exports.checkAvailability = async (req, res, next) => {
    try {
        const { court, startTime, endTime } = req.body;

        if (!court || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'Court ID, start time, and end time are required'
            });
        }

        const courtDoc = await Court.findById(court);
        if (!courtDoc) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check court availability
        const availability = await courtDoc.isAvailableForSlot(startTime, endTime);

        if (!availability.available) {
            return res.status(200).json({
                success: true,
                available: false,
                reason: availability.reason
            });
        }

        // Check for booking conflicts
        const conflicts = await Booking.checkConflicts(court, startTime, endTime);

        res.status(200).json({
            success: true,
            available: conflicts.length === 0,
            conflicts: conflicts.length > 0 ? conflicts.map(c => ({
                bookingNumber: c.bookingNumber,
                startTime: c.startTime,
                endTime: c.endTime,
                status: c.status
            })) : []
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get available slots for a court on a specific date
 * @route   GET /api/bookings/available-slots/:courtId
 * @access  Public
 */
exports.getAvailableSlots = async (req, res, next) => {
    try {
        const { courtId } = req.params;
        const { date, interval = 30 } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date is required'
            });
        }

        const slots = await Booking.findAvailableSlots(courtId, date, parseInt(interval));

        res.status(200).json({
            success: true,
            date,
            interval: parseInt(interval),
            totalSlots: slots.length,
            availableSlots: slots.filter(s => s.available).length,
            data: slots
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Approve booking (for courts requiring approval)
 * @route   POST /api/bookings/:id/approve
 * @access  Private (Owner/Manager/Admin)
 */
exports.approveBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('court venue');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check authorization
        const isVenueOwner = booking.venue.owner.toString() === req.user._id.toString();
        const isCourtOwner = booking.court.owner.toString() === req.user._id.toString();
        const isManager = booking.court.managers.some(m => m.toString() === req.user._id.toString()) ||
            booking.venue.managers.some(m => m.toString() === req.user._id.toString());
        const isAdmin = req.user.role === 'admin';

        if (!isVenueOwner && !isCourtOwner && !isManager && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to approve bookings'
            });
        }

        if (booking.status !== 'pending-confirmation') {
            return res.status(400).json({
                success: false,
                message: 'Only pending bookings can be approved'
            });
        }

        booking.status = 'confirmed';
        booking.approvedBy = req.user._id;
        booking.approvedAt = new Date();

        await booking.save();

        // TODO: Send confirmation email/notification to user

        res.status(200).json({
            success: true,
            message: 'Booking approved successfully',
            data: booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Reject booking
 * @route   POST /api/bookings/:id/reject
 * @access  Private (Owner/Manager/Admin)
 */
exports.rejectBooking = async (req, res, next) => {
    try {
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        const booking = await Booking.findById(req.params.id).populate('court venue');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check authorization
        const isVenueOwner = booking.venue.owner.toString() === req.user._id.toString();
        const isCourtOwner = booking.court.owner.toString() === req.user._id.toString();
        const isManager = booking.court.managers.some(m => m.toString() === req.user._id.toString()) ||
            booking.venue.managers.some(m => m.toString() === req.user._id.toString());
        const isAdmin = req.user.role === 'admin';

        if (!isVenueOwner && !isCourtOwner && !isManager && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to reject bookings'
            });
        }

        if (booking.status !== 'pending-confirmation') {
            return res.status(400).json({
                success: false,
                message: 'Only pending bookings can be rejected'
            });
        }

        booking.status = 'cancelled';
        booking.rejectionReason = reason;
        booking.cancellation = {
            cancelledAt: new Date(),
            cancelledBy: req.user._id,
            reason,
            refundEligible: true,
            refundPercentage: 100
        };

        await booking.save();

        // TODO: Send rejection notification to user

        res.status(200).json({
            success: true,
            message: 'Booking rejected successfully',
            data: booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Check-in to booking
 * @route   POST /api/bookings/:id/check-in
 * @access  Private
 */
exports.checkIn = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check authorization
        const isOwner = booking.user.toString() === req.user._id.toString();
        const isStaff = req.user.role === 'manager' || req.user.role === 'admin';

        if (!isOwner && !isStaff) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to check-in'
            });
        }

        if (booking.status !== 'confirmed') {
            return res.status(400).json({
                success: false,
                message: 'Only confirmed bookings can be checked in'
            });
        }

        const now = new Date();
        const startTime = new Date(booking.startTime);
        const timeDiff = (startTime - now) / (1000 * 60); // in minutes

        // Allow check-in 15 minutes before start time
        if (timeDiff > 15) {
            return res.status(400).json({
                success: false,
                message: 'Check-in is only allowed 15 minutes before booking start time'
            });
        }

        booking.checkIn = {
            time: now,
            verifiedBy: req.user._id
        };
        booking.status = 'in-progress';

        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Checked in successfully',
            data: booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Check-out from booking
 * @route   POST /api/bookings/:id/check-out
 * @access  Private
 */
exports.checkOut = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check authorization
        const isOwner = booking.user.toString() === req.user._id.toString();
        const isStaff = req.user.role === 'manager' || req.user.role === 'admin';

        if (!isOwner && !isStaff) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to check-out'
            });
        }

        if (booking.status !== 'in-progress') {
            return res.status(400).json({
                success: false,
                message: 'Only in-progress bookings can be checked out'
            });
        }

        booking.checkOut = {
            time: new Date(),
            verifiedBy: req.user._id
        };
        booking.status = 'completed';

        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Checked out successfully',
            data: booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get user's booking history
 * @route   GET /api/bookings/my-bookings
 * @access  Private
 */
exports.getMyBookings = async (req, res, next) => {
    try {
        const { status, upcoming, page = 1, limit = 20 } = req.query;

        const query = { user: req.user._id };

        if (status) {
            query.status = status;
        }

        if (upcoming === 'true') {
            query.startTime = { $gte: new Date() };
            query.status = { $in: ['confirmed', 'pending-confirmation'] };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const bookings = await Booking.find(query)
            .populate('court', 'name courtNumber sportType')
            .populate('venue', 'name address')
            .sort('-startTime')
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await Booking.countDocuments(query);

        // Get user stats
        const stats = await Booking.getUserStats(req.user._id);

        res.status(200).json({
            success: true,
            count: bookings.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            stats,
            data: bookings
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Helper function to generate recurring bookings
 */
async function generateRecurringBookings(parentBooking, court) {
    const recurringBookings = [];
    const { frequency, interval, daysOfWeek, endDate, occurrences } = parentBooking.recurringPattern;

    let currentDate = new Date(parentBooking.startTime);
    const duration = parentBooking.endTime - parentBooking.startTime;
    let count = 0;
    const maxOccurrences = occurrences || 52; // Default max 52 occurrences

    while (count < maxOccurrences) {
        // Calculate next occurrence based on frequency
        if (frequency === 'daily') {
            currentDate.setDate(currentDate.getDate() + (interval || 1));
        } else if (frequency === 'weekly') {
            currentDate.setDate(currentDate.getDate() + 7 * (interval || 1));
        } else if (frequency === 'monthly') {
            currentDate.setMonth(currentDate.getMonth() + (interval || 1));
        }

        // Check if we've reached the end date
        if (endDate && currentDate > new Date(endDate)) {
            break;
        }

        // Check if day matches for weekly bookings
        if (daysOfWeek && daysOfWeek.length > 0) {
            if (!daysOfWeek.includes(currentDate.getDay())) {
                continue;
            }
        }

        const newStartTime = new Date(currentDate);
        const newEndTime = new Date(currentDate.getTime() + duration);

        // Check for conflicts
        const conflicts = await Booking.checkConflicts(court._id, newStartTime, newEndTime);

        if (conflicts.length === 0) {
            const recurringBooking = new Booking({
                ...parentBooking.toObject(),
                _id: undefined,
                bookingNumber: undefined,
                startTime: newStartTime,
                endTime: newEndTime,
                parentBooking: parentBooking._id,
                recurringPattern: undefined,
                recurringBookings: undefined,
                createdAt: undefined,
                updatedAt: undefined
            });

            await recurringBooking.save();
            recurringBookings.push(recurringBooking);
            count++;
        }
    }

    return recurringBookings;
}

module.exports = exports;