const mongoose = require('mongoose');

// Payment Information Sub-Schema
const paymentInfoSchema = new mongoose.Schema({
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
        enum: ['pending', 'completed', 'failed', 'refunded', 'partially-refunded'],
        default: 'pending',
    },
    method: {
        type: String,
        enum: ['cash', 'card', 'online', 'wallet', 'bank-transfer'],
    },
    transactionId: String,
    paidAt: Date,
    refundAmount: {
        type: Number,
        default: 0,
        min: 0,
    },
    refundedAt: Date,
    refundReason: String,
}, { _id: false });

// Cancellation Information Sub-Schema
const cancellationInfoSchema = new mongoose.Schema({
    cancelledAt: {
        type: Date,
        required: true,
    },
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    reason: {
        type: String,
        required: true,
    },
    refundEligible: {
        type: Boolean,
        default: false,
    },
    refundPercentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
    },
    cancellationFee: {
        type: Number,
        default: 0,
        min: 0,
    },
}, { _id: false });

// Participant Sub-Schema (for group bookings)
const participantSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    name: String,
    email: String,
    phone: String,
    status: {
        type: String,
        enum: ['invited', 'confirmed', 'declined'],
        default: 'invited',
    },
    paymentShare: {
        type: Number,
        min: 0,
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid'],
        default: 'pending',
    },
}, { _id: true });

// Main Booking Schema
const bookingSchema = new mongoose.Schema({
    // Reference Information
    bookingNumber: {
        type: String,
        unique: true,
        // Auto-generated in pre-save hook
    },

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

    // Booking Time Information
    startTime: {
        type: Date,
        required: [true, 'Start time is required'],
        index: true,
    },

    endTime: {
        type: Date,
        required: [true, 'End time is required'],
        validate: {
            validator: function (value) {
                return value > this.startTime;
            },
            message: 'End time must be after start time'
        },
    },

    duration: {
        type: Number,
        // Duration in minutes, auto-calculated in pre-save hook
    },

    timezone: {
        type: String,
        default: 'Asia/Karachi',
    },

    // Booking Type
    bookingType: {
        type: String,
        enum: ['single', 'recurring'],
        default: 'single',
    },

    // Recurring Booking Information
    recurringPattern: {
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly'],
        },
        interval: {
            type: Number,
            min: 1,
        },
        daysOfWeek: [{
            type: Number,
            min: 0,
            max: 6,
        }],
        endDate: Date,
        occurrences: Number,
    },

    parentBooking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        // Reference to parent if this is part of recurring series
    },

    recurringBookings: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        // References to all bookings in recurring series
    }],

    // Status Management
    status: {
        type: String,
        enum: [
            'pending-confirmation',  // Waiting for approval
            'confirmed',             // Confirmed and active
            'in-progress',          // Currently happening
            'completed',            // Successfully completed
            'cancelled',            // Cancelled by user/admin
            'no-show',              // User didn't show up
            'expired',              // Tentative booking expired
        ],
        default: 'pending-confirmation',
        index: true,
    },

    // Pricing Information
    pricing: {
        basePrice: {
            type: Number,
            required: true,
            min: 0,
        },
        discounts: [{
            type: {
                type: String,
                enum: ['membership', 'promotional', 'group', 'early-bird', 'coupon'],
            },
            name: String,
            amount: Number,
            percentage: Number,
        }],
        totalDiscount: {
            type: Number,
            default: 0,
            min: 0,
        },
        subtotal: {
            type: Number,
            required: true,
            min: 0,
        },
        tax: {
            type: Number,
            default: 0,
            min: 0,
        },
        serviceFee: {
            type: Number,
            default: 0,
            min: 0,
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: 'PKR',
            uppercase: true,
        },
    },

    // Payment Information
    payment: paymentInfoSchema,

    // Group Booking
    isGroupBooking: {
        type: Boolean,
        default: false,
    },

    groupSize: {
        type: Number,
        min: 1,
        default: 1,
    },

    participants: [participantSchema],

    groupLeader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    // Additional Services/Equipment
    additionalServices: [{
        serviceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Service',
        },
        serviceName: String,
        quantity: {
            type: Number,
            default: 1,
            min: 1,
        },
        price: Number,
    }],

    equipmentRental: [{
        equipmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Equipment',
        },
        equipmentName: String,
        quantity: {
            type: Number,
            default: 1,
            min: 1,
        },
        price: Number,
    }],

    // Booking Details
    notes: {
        type: String,
        maxlength: 1000,
    },

    specialRequests: {
        type: String,
        maxlength: 500,
    },

    // Contact Information (for guest bookings or different contact)
    contactInfo: {
        name: String,
        email: String,
        phone: String,
    },

    // Approval Workflow
    requiresApproval: {
        type: Boolean,
        default: false,
    },

    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    approvedAt: Date,

    rejectionReason: String,

    // Check-in/Check-out
    checkIn: {
        time: Date,
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },

    checkOut: {
        time: Date,
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },

    // Cancellation
    cancellation: cancellationInfoSchema,

    // Tentative Booking
    isTentative: {
        type: Boolean,
        default: false,
    },

    tentativeExpiryTime: Date,

    // Waitlist
    isWaitlisted: {
        type: Boolean,
        default: false,
    },

    waitlistPosition: Number,

    // Modification History
    modificationHistory: [{
        modifiedAt: {
            type: Date,
            default: Date.now,
        },
        modifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        changes: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
        },
        reason: String,
    }],

    // Transfer Information
    transferredFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    transferredAt: Date,

    // Ratings & Reviews
    rating: {
        type: Number,
        min: 1,
        max: 5,
    },

    review: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Review',
    },

    // Admin/Internal Notes
    internalNotes: [{
        note: String,
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        addedAt: {
            type: Date,
            default: Date.now,
        },
    }],

    // Metadata
    source: {
        type: String,
        enum: ['web', 'mobile', 'admin', 'api', 'walk-in'],
        default: 'web',
    },

    ipAddress: String,

    userAgent: String,

    // Flags
    isNoShow: {
        type: Boolean,
        default: false,
    },

    isPaid: {
        type: Boolean,
        default: false,
    },

    isReviewed: {
        type: Boolean,
        default: false,
    },

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Indexes for Performance
bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ court: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ venue: 1, status: 1 });
bookingSchema.index({ bookingNumber: 1 });
bookingSchema.index({ status: 1, startTime: 1 });
bookingSchema.index({ createdAt: -1 });

// Compound index for conflict detection
bookingSchema.index({
    court: 1,
    startTime: 1,
    endTime: 1,
    status: 1
});

// Index for recurring bookings
bookingSchema.index({ parentBooking: 1 });

// Pre-save middleware to auto-calculate duration and generate booking number
bookingSchema.pre('save', async function (next) {
    // Calculate duration in minutes
    if (this.isModified('startTime') || this.isModified('endTime')) {
        this.duration = Math.round((this.endTime - this.startTime) / (1000 * 60));
    }

    // Generate unique booking number
    if (this.isNew && !this.bookingNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        // Get count of bookings today with retry logic for race conditions
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
            const startOfDay = new Date(date.setHours(0, 0, 0, 0));
            const endOfDay = new Date(date.setHours(23, 59, 59, 999));

            const count = await this.constructor.countDocuments({
                createdAt: { $gte: startOfDay, $lte: endOfDay }
            });

            // Add a small random component to reduce collisions in tests
            const randomComponent = Math.floor(Math.random() * 100);
            const sequence = String(count + randomComponent + 1).padStart(4, '0');
            const bookingNumber = `BK${year}${month}${day}${sequence}`;

            // Check if this booking number already exists
            const existing = await this.constructor.findOne({ bookingNumber });

            if (!existing) {
                this.bookingNumber = bookingNumber;
                break;
            }

            attempts++;

            // If we've exhausted attempts, use timestamp-based fallback
            if (attempts >= maxAttempts) {
                const timestamp = Date.now().toString().slice(-4);
                this.bookingNumber = `BK${year}${month}${day}${timestamp}`;
            }
        }
    }

    // Set isPaid flag based on payment status
    if (this.payment && this.payment.status === 'completed') {
        this.isPaid = true;
    }

    next();
});

// Static method to check for conflicts
bookingSchema.statics.checkConflicts = async function (courtId, startTime, endTime, excludeBookingId = null) {
    const query = {
        court: courtId,
        status: { $in: ['pending-confirmation', 'confirmed', 'in-progress'] },
        $or: [
            // New booking starts during existing booking
            {
                startTime: { $lte: startTime },
                endTime: { $gt: startTime }
            },
            // New booking ends during existing booking
            {
                startTime: { $lt: endTime },
                endTime: { $gte: endTime }
            },
            // New booking completely contains existing booking
            {
                startTime: { $gte: startTime },
                endTime: { $lte: endTime }
            },
            // Existing booking completely contains new booking
            {
                startTime: { $lte: startTime },
                endTime: { $gte: endTime }
            }
        ]
    };

    if (excludeBookingId) {
        query._id = { $ne: excludeBookingId };
    }

    const conflicts = await this.find(query)
        .populate('user', 'firstName lastName email')
        .lean();

    return conflicts;
};

// Static method to find available slots
bookingSchema.statics.findAvailableSlots = async function (courtId, date, interval = 30) {
    const Court = mongoose.model('Court');
    const court = await Court.findById(courtId);

    if (!court) {
        throw new Error('Court not found');
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // Get all bookings for the day
    const bookings = await this.find({
        court: courtId,
        status: { $in: ['pending-confirmation', 'confirmed', 'in-progress'] },
        startTime: { $gte: startDate },
        endTime: { $lte: endDate }
    }).sort({ startTime: 1 });

    // Get operating hours for the day
    const dayOfWeek = startDate.getDay();
    const operatingHour = court.operatingHours.find(oh => oh.dayOfWeek === dayOfWeek);

    if (!operatingHour || operatingHour.isClosed) {
        return [];
    }

    // Generate all possible slots
    const slots = [];
    const [openHour, openMinute] = operatingHour.openTime.split(':').map(Number);
    const [closeHour, closeMinute] = operatingHour.closeTime.split(':').map(Number);

    let currentSlot = new Date(startDate);
    currentSlot.setHours(openHour, openMinute, 0, 0);

    const closeTime = new Date(startDate);
    closeTime.setHours(closeHour, closeMinute, 0, 0);

    while (currentSlot < closeTime) {
        const slotEnd = new Date(currentSlot.getTime() + interval * 60000);

        if (slotEnd <= closeTime) {
            // Check if slot conflicts with any booking
            const hasConflict = bookings.some(booking => {
                return (
                    (currentSlot >= booking.startTime && currentSlot < booking.endTime) ||
                    (slotEnd > booking.startTime && slotEnd <= booking.endTime) ||
                    (currentSlot <= booking.startTime && slotEnd >= booking.endTime)
                );
            });

            slots.push({
                startTime: new Date(currentSlot),
                endTime: new Date(slotEnd),
                available: !hasConflict,
            });
        }

        currentSlot = new Date(currentSlot.getTime() + interval * 60000);
    }

    return slots;
};

// Instance method to calculate cancellation refund
bookingSchema.methods.calculateCancellationRefund = function () {
    const now = new Date();
    const hoursUntilBooking = (this.startTime - now) / (1000 * 60 * 60);

    const Court = mongoose.model('Court');
    const Venue = mongoose.model('Venue');

    // Default cancellation policy (can be overridden by venue/court settings)
    let refundPercentage = 0;
    let cancellationFee = 0;

    if (hoursUntilBooking >= 24) {
        refundPercentage = 100;
    } else if (hoursUntilBooking >= 12) {
        refundPercentage = 75;
    } else if (hoursUntilBooking >= 6) {
        refundPercentage = 50;
    } else if (hoursUntilBooking >= 2) {
        refundPercentage = 25;
    }

    const refundAmount = (this.pricing.totalAmount * refundPercentage) / 100;
    cancellationFee = this.pricing.totalAmount - refundAmount;

    return {
        refundEligible: refundPercentage > 0,
        refundPercentage,
        refundAmount,
        cancellationFee,
        hoursUntilBooking: Math.round(hoursUntilBooking * 10) / 10,
    };
};

// Instance method to check if booking can be modified
bookingSchema.methods.canBeModified = function () {
    const now = new Date();
    const hoursUntilBooking = (this.startTime - now) / (1000 * 60 * 60);

    if (this.status !== 'confirmed' && this.status !== 'pending-confirmation') {
        return { allowed: false, reason: 'Booking cannot be modified in current status' };
    }

    if (hoursUntilBooking < 2) {
        return { allowed: false, reason: 'Booking cannot be modified less than 2 hours before start time' };
    }

    return { allowed: true };
};

// Instance method to check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function () {
    if (this.status === 'cancelled' || this.status === 'completed' || this.status === 'no-show') {
        return { allowed: false, reason: `Booking is already ${this.status}` };
    }

    const now = new Date();
    if (this.startTime <= now) {
        return { allowed: false, reason: 'Cannot cancel a booking that has already started or passed' };
    }

    return { allowed: true };
};

// Virtual for booking status color (for UI)
bookingSchema.virtual('statusColor').get(function () {
    const colors = {
        'pending-confirmation': 'yellow',
        'confirmed': 'green',
        'in-progress': 'blue',
        'completed': 'gray',
        'cancelled': 'red',
        'no-show': 'orange',
        'expired': 'gray',
    };
    return colors[this.status] || 'gray';
});

// Virtual for time until booking
bookingSchema.virtual('timeUntilBooking').get(function () {
    const now = new Date();
    const diff = this.startTime - now;

    if (diff < 0) return 'Past';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours === 0) return `${minutes} minutes`;
    if (hours < 24) return `${hours} hours, ${minutes} minutes`;

    const days = Math.floor(hours / 24);
    return `${days} days`;
});

// Static method to get user's booking statistics
bookingSchema.statics.getUserStats = async function (userId) {
    const stats = await this.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalSpent: { $sum: '$pricing.totalAmount' }
            }
        }
    ]);

    const totalBookings = await this.countDocuments({ user: userId });
    const activeBookings = await this.countDocuments({
        user: userId,
        status: { $in: ['confirmed', 'pending-confirmation', 'in-progress'] }
    });

    return {
        totalBookings,
        activeBookings,
        statusBreakdown: stats,
    };
};

// Static method to update booking status based on time
bookingSchema.statics.updateBookingStatuses = async function () {
    const now = new Date();

    // Mark expired tentative bookings
    await this.updateMany(
        {
            isTentative: true,
            tentativeExpiryTime: { $lte: now },
            status: 'pending-confirmation'
        },
        { status: 'expired' }
    );

    // Mark bookings as in-progress
    await this.updateMany(
        {
            status: 'confirmed',
            startTime: { $lte: now },
            endTime: { $gte: now }
        },
        { status: 'in-progress' }
    );

    // Mark bookings as completed
    await this.updateMany(
        {
            status: 'in-progress',
            endTime: { $lt: now }
        },
        { status: 'completed' }
    );

    // Mark confirmed bookings as no-show if not checked in
    const noShowThreshold = new Date(now.getTime() - 30 * 60000); // 30 minutes after start
    await this.updateMany(
        {
            status: 'confirmed',
            startTime: { $lte: noShowThreshold },
            checkIn: { $exists: false }
        },
        {
            status: 'no-show',
            isNoShow: true
        }
    );
};

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;