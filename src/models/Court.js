const mongoose = require('mongoose');

// Operating Hours Sub-Schema
const operatingHoursSchema = new mongoose.Schema({
    dayOfWeek: {
        type: Number,
        required: true,
        min: 0,
        max: 6,
        // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    },
    openTime: {
        type: String,
        required: true,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        // Format: HH:MM (24-hour)
    },
    closeTime: {
        type: String,
        required: true,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
    isClosed: {
        type: Boolean,
        default: false,
    },
    breakTimes: [{
        startTime: {
            type: String,
            match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        },
        endTime: {
            type: String,
            match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        },
        reason: String,
    }],
}, { _id: false });

// Pricing Rule Sub-Schema
const pricingRuleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: ['peak', 'off-peak', 'weekend', 'weekday', 'seasonal', 'holiday', 'promotional', 'early-bird', 'last-minute'],
        required: true,
    },
    baseRate: {
        type: Number,
        required: true,
        min: 0,
    },
    startDate: Date,
    endDate: Date,
    daysOfWeek: [{
        type: Number,
        min: 0,
        max: 6,
    }],
    startTime: {
        type: String,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
    endTime: {
        type: String,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
    priority: {
        type: Number,
        default: 0,
        // Higher priority rules override lower ones
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { _id: true, timestamps: true });

// Discount Rule Sub-Schema
const discountRuleSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['membership', 'loyalty', 'group', 'early-bird', 'last-minute', 'bulk', 'promotional'],
        required: true,
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true,
    },
    value: {
        type: Number,
        required: true,
        min: 0,
    },
    minBookingDuration: Number, // in minutes
    minGroupSize: Number,
    advanceBookingHours: Number,
    membershipTier: String,
    isActive: {
        type: Boolean,
        default: true,
    },
}, { _id: false });

// Availability Exception Sub-Schema
const availabilityExceptionSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
    },
    type: {
        type: String,
        enum: ['holiday', 'maintenance', 'special-event', 'blackout', 'custom'],
        required: true,
    },
    isAvailable: {
        type: Boolean,
        default: false,
    },
    customHours: {
        openTime: String,
        closeTime: String,
    },
    reason: String,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, { _id: true, timestamps: true });

// Media Sub-Schema
const mediaSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['image', 'video', 'virtual-tour'],
        required: true,
    },
    url: {
        type: String,
        required: true,
    },
    publicId: String, // For Cloudinary
    thumbnail: String,
    altText: String,
    caption: String,
    isWatermarked: {
        type: Boolean,
        default: false,
    },
    isPrimary: {
        type: Boolean,
        default: false,
    },
    order: {
        type: Number,
        default: 0,
    },
    dimensions: {
        width: Number,
        height: Number,
    },
    size: Number, // in bytes
    uploadedAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: true });

// Amenities Sub-Schema
const amenitiesSchema = new mongoose.Schema({
    lighting: {
        type: Boolean,
        default: false,
    },
    parking: {
        type: Boolean,
        default: false,
    },
    lockers: {
        type: Boolean,
        default: false,
    },
    showers: {
        type: Boolean,
        default: false,
    },
    restrooms: {
        type: Boolean,
        default: false,
    },
    waterCooler: {
        type: Boolean,
        default: false,
    },
    seating: {
        type: Boolean,
        default: false,
    },
    wifi: {
        type: Boolean,
        default: false,
    },
    airConditioning: {
        type: Boolean,
        default: false,
    },
    foodAndBeverage: {
        type: Boolean,
        default: false,
    },
    proShop: {
        type: Boolean,
        default: false,
    },
    wheelchairAccessible: {
        type: Boolean,
        default: false,
    },
    firstAid: {
        type: Boolean,
        default: false,
    },
    security: {
        type: Boolean,
        default: false,
    },
    custom: [{
        name: String,
        available: Boolean,
    }],
}, { _id: false });

// Main Court Schema
const courtSchema = new mongoose.Schema({
    // Basic Information
    name: {
        type: String,
        required: [true, 'Court name is required'],
        trim: true,
        maxlength: [100, 'Court name cannot exceed 100 characters'],
    },
    courtNumber: {
        type: String,
        trim: true,
    },
    description: {
        type: String,
        maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },

    // Venue/Location Information
    venue: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Venue',
        required: [true, 'Venue reference is required'],
    },

    // Court Classification
    sportType: {
        type: String,
        enum: ['tennis', 'badminton', 'squash', 'basketball', 'volleyball', 'pickleball', 'table-tennis', 'futsal', 'other'],
        required: [true, 'Sport type is required'],
    },
    surfaceType: {
        type: String,
        enum: ['hard-court', 'clay', 'grass', 'synthetic-grass', 'acrylic', 'concrete', 'wooden', 'rubber', 'carpet', 'other'],
    },
    courtType: {
        type: String,
        enum: ['indoor', 'outdoor', 'covered'],
        required: true,
        default: 'outdoor',
    },

    // Specifications
    dimensions: {
        length: {
            type: Number,
            min: 0,
        },
        width: {
            type: Number,
            min: 0,
        },
        unit: {
            type: String,
            enum: ['meters', 'feet'],
            default: 'meters',
        },
    },
    capacity: {
        minPlayers: {
            type: Number,
            min: 1,
            default: 2,
        },
        maxPlayers: {
            type: Number,
            min: 1,
            default: 4,
        },
    },

    // Amenities & Features
    amenities: amenitiesSchema,

    // Accessibility
    accessibility: {
        wheelchairAccessible: {
            type: Boolean,
            default: false,
        },
        elevatorAccess: {
            type: Boolean,
            default: false,
        },
        accessibleParking: {
            type: Boolean,
            default: false,
        },
        accessibleRestrooms: {
            type: Boolean,
            default: false,
        },
        notes: String,
    },

    // Media
    media: [mediaSchema],

    // Pricing Configuration
    baseHourlyRate: {
        type: Number,
        required: [true, 'Base hourly rate is required'],
        min: [0, 'Base hourly rate cannot be negative'],
    },
    currency: {
        type: String,
        default: 'PKR',
        uppercase: true,
    },
    pricingRules: [pricingRuleSchema],
    discountRules: [discountRuleSchema],

    // Booking Configuration
    bookingSettings: {
        minBookingDuration: {
            type: Number,
            default: 60,
            min: 15,
            // in minutes
        },
        maxBookingDuration: {
            type: Number,
            default: 180,
            // in minutes
        },
        bookingInterval: {
            type: Number,
            default: 30,
            min: 15,
            // Time slot intervals in minutes
        },
        advanceBookingDays: {
            type: Number,
            default: 30,
            min: 0,
            // How many days in advance can users book
        },
        sameDayBookingCutoff: {
            type: Number,
            default: 120,
            // Minutes before slot time that same-day booking closes
        },
        bufferTimeBetweenBookings: {
            type: Number,
            default: 0,
            // Buffer time in minutes between bookings
        },
        allowRecurringBookings: {
            type: Boolean,
            default: true,
        },
        allowPartialBooking: {
            type: Boolean,
            default: false,
            // For half-court bookings
        },
        maxConcurrentBookingsPerUser: {
            type: Number,
            default: 3,
        },
        requiresApproval: {
            type: Boolean,
            default: false,
        },
    },

    // Operating Hours
    operatingHours: [operatingHoursSchema],
    timezone: {
        type: String,
        default: 'Asia/Karachi',
    },

    // Availability Exceptions
    availabilityExceptions: [availabilityExceptionSchema],

    // Status Management
    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance', 'temporarily-closed'],
        default: 'active',
        index: true,
    },
    maintenanceSchedule: [{
        startDate: Date,
        endDate: Date,
        reason: String,
        isRecurring: {
            type: Boolean,
            default: false,
        },
        recurringPattern: {
            frequency: {
                type: String,
                enum: ['daily', 'weekly', 'monthly'],
            },
            interval: Number,
        },
    }],

    // Ownership & Management
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    managers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],

    // Statistics & Metrics
    stats: {
        totalBookings: {
            type: Number,
            default: 0,
        },
        totalRevenue: {
            type: Number,
            default: 0,
        },
        averageRating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },
        totalReviews: {
            type: Number,
            default: 0,
        },
        occupancyRate: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
    },

    // SEO & Search Optimization
    slug: {
        type: String,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true,
    },
    tags: [{
        type: String,
        lowercase: true,
        trim: true,
    }],

    // Flags
    isFeatured: {
        type: Boolean,
        default: false,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },

    // Metadata
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
    },

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Indexes for Performance
courtSchema.index({ venue: 1, status: 1 });
courtSchema.index({ sportType: 1, status: 1 });
courtSchema.index({ 'stats.averageRating': -1 });

courtSchema.index({ tags: 1 });
courtSchema.index({ owner: 1 });
courtSchema.index({ createdAt: -1 });

// Compound index for search and filtering
courtSchema.index({
    status: 1,
    sportType: 1,
    courtType: 1,
    'stats.averageRating': -1
});

// Text index for search
courtSchema.index({
    name: 'text',
    description: 'text',
    tags: 'text'
});

// Pre-save middleware to generate slug
courtSchema.pre('save', async function (next) {
    if (this.isModified('name') && !this.slug) {
        const baseSlug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        let slug = baseSlug;
        let counter = 1;

        // Ensure unique slug
        while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        this.slug = slug;
    }
    next();
});

// Virtual for primary image
courtSchema.virtual('primaryImage').get(function () {
    const primaryMedia = this.media.find(m => m.isPrimary && m.type === 'image');
    return primaryMedia || this.media.find(m => m.type === 'image');
});

// Virtual for checking if court is currently open
courtSchema.virtual('isCurrentlyOpen').get(function () {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const todayHours = this.operatingHours.find(oh => oh.dayOfWeek === dayOfWeek);

    if (!todayHours || todayHours.isClosed) {
        return false;
    }

    // Check if current time is within operating hours
    return currentTime >= todayHours.openTime && currentTime <= todayHours.closeTime;
});

// Instance method to calculate price for a time slot
courtSchema.methods.calculatePrice = function (startTime, endTime, options = {}) {
    const duration = (new Date(endTime) - new Date(startTime)) / (1000 * 60 * 60); // in hours
    const dayOfWeek = new Date(startTime).getDay();
    const timeStr = `${String(new Date(startTime).getHours()).padStart(2, '0')}:${String(new Date(startTime).getMinutes()).padStart(2, '0')}`;

    // Find applicable pricing rule (highest priority)
    const applicableRules = this.pricingRules
        .filter(rule => {
            if (!rule.isActive) return false;

            // Check date range
            if (rule.startDate && new Date(startTime) < new Date(rule.startDate)) return false;
            if (rule.endDate && new Date(startTime) > new Date(rule.endDate)) return false;

            // Check day of week
            if (rule.daysOfWeek && rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(dayOfWeek)) return false;

            // Check time range
            if (rule.startTime && timeStr < rule.startTime) return false;
            if (rule.endTime && timeStr > rule.endTime) return false;

            return true;
        })
        .sort((a, b) => b.priority - a.priority);

    const baseRate = applicableRules.length > 0 ? applicableRules[0].baseRate : this.baseHourlyRate;
    let totalPrice = baseRate * duration;

    // Apply discounts
    if (options.membershipTier || options.groupSize || options.isEarlyBird) {
        const applicableDiscounts = this.discountRules.filter(discount => {
            if (!discount.isActive) return false;

            if (discount.type === 'membership' && options.membershipTier === discount.membershipTier) return true;
            if (discount.type === 'group' && options.groupSize >= discount.minGroupSize) return true;
            if (discount.type === 'early-bird' && options.isEarlyBird) return true;

            return false;
        });

        applicableDiscounts.forEach(discount => {
            if (discount.discountType === 'percentage') {
                totalPrice -= (totalPrice * discount.value / 100);
            } else {
                totalPrice -= discount.value;
            }
        });
    }

    return Math.max(0, totalPrice);
};

// Instance method to check availability for a time slot
courtSchema.methods.isAvailableForSlot = async function (startTime, endTime) {
    const startDate = new Date(startTime);
    const dayOfWeek = startDate.getDay();
    const timeStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;

    // Check court status
    if (this.status !== 'active') {
        return { available: false, reason: 'Court is not active' };
    }

    // Check operating hours
    const operatingHour = this.operatingHours.find(oh => oh.dayOfWeek === dayOfWeek);
    if (!operatingHour || operatingHour.isClosed) {
        return { available: false, reason: 'Court is closed on this day' };
    }

    if (timeStr < operatingHour.openTime || timeStr >= operatingHour.closeTime) {
        return { available: false, reason: 'Outside operating hours' };
    }

    // Check availability exceptions
    const dateStr = startDate.toISOString().split('T')[0];
    const exception = this.availabilityExceptions.find(exc =>
        new Date(exc.date).toISOString().split('T')[0] === dateStr
    );

    if (exception && !exception.isAvailable) {
        return { available: false, reason: exception.reason || 'Court is unavailable on this date' };
    }

    // Check for existing bookings (will be implemented with Booking model)
    // This is a placeholder - actual booking conflict check will be in booking controller

    return { available: true };
};

// Static method to get courts by venue
courtSchema.statics.getByVenue = function (venueId, filters = {}) {
    const query = { venue: venueId, status: 'active', ...filters };
    return this.find(query).populate('venue owner');
};

// Static method to search courts
courtSchema.statics.searchCourts = function (searchParams) {
    const {
        text,
        sportType,
        courtType,
        minPrice,
        maxPrice,
        minRating,
        amenities,
        status = 'active',
        sortBy = '-stats.averageRating',
        page = 1,
        limit = 20,
    } = searchParams;

    const query = { status };

    if (text) {
        query.$text = { $search: text };
    }

    if (sportType) {
        query.sportType = sportType;
    }

    if (courtType) {
        query.courtType = courtType;
    }

    if (minPrice || maxPrice) {
        query.baseHourlyRate = {};
        if (minPrice) query.baseHourlyRate.$gte = minPrice;
        if (maxPrice) query.baseHourlyRate.$lte = maxPrice;
    }

    if (minRating) {
        query['stats.averageRating'] = { $gte: minRating };
    }

    if (amenities && amenities.length > 0) {
        amenities.forEach(amenity => {
            query[`amenities.${amenity}`] = true;
        });
    }

    const skip = (page - 1) * limit;

    return this.find(query)
        .populate('venue owner')
        .sort(sortBy)
        .skip(skip)
        .limit(limit);
};

const Court = mongoose.model('Court', courtSchema);

module.exports = Court;