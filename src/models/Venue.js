const mongoose = require('mongoose');

// Address Sub-Schema
const addressSchema = new mongoose.Schema({
    street: {
        type: String,
        required: true,
    },
    city: {
        type: String,
        required: true,
    },
    state: {
        type: String,
        required: true,
    },
    country: {
        type: String,
        required: true,
    },
    postalCode: {
        type: String,
    },
    landmark: String,
}, { _id: false });

// Location Sub-Schema with GeoJSON
// Location Sub-Schema with GeoJSON
const locationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
        required: true,
    },
    coordinates: {
        type: [Number],
        required: true,
        // [longitude, latitude]
        validate: {
            validator: function (coords) {
                return coords.length === 2 &&
                    coords[0] >= -180 && coords[0] <= 180 &&
                    coords[1] >= -90 && coords[1] <= 90;
            },
            message: 'Invalid coordinates format'
        }
    },
    googleMapsUrl: {
        type: String,
        trim: true,
        validate: {
            validator: function(url) {
                if (!url) return true; // Optional field
                // Validate Google Maps URL format
                return /^https:\/\/(www\.)?google\.com\/maps/.test(url) || 
                       /^https:\/\/maps\.google\.com/.test(url) ||
                       /^https:\/\/goo\.gl\/maps/.test(url) ||
                       /^https:\/\/maps\.app\.goo\.gl/.test(url);
            },
            message: 'Invalid Google Maps URL format'
        }
    },
}, { _id: false });

// Contact Sub-Schema
const contactSchema = new mongoose.Schema({
    primaryPhone: {
        type: String,
        required: true,
    },
    secondaryPhone: String,
    email: {
        type: String,
        required: true,
        lowercase: true,
    },
    website: String,
    socialMedia: {
        facebook: String,
        instagram: String,
        twitter: String,
        youtube: String,
    },
}, { _id: false });

// Operating Hours (Venue-level default)
const venueOperatingHoursSchema = new mongoose.Schema({
    dayOfWeek: {
        type: Number,
        required: true,
        min: 0,
        max: 6,
    },
    openTime: {
        type: String,
        required: true,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
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
}, { _id: false });

// Main Venue Schema
const venueSchema = new mongoose.Schema({
    // Basic Information
    name: {
        type: String,
        required: [true, 'Venue name is required'],
        trim: true,
        maxlength: [150, 'Venue name cannot exceed 150 characters'],
        index: true,
    },
    displayName: {
        type: String,
        trim: true,
    },
    description: {
        type: String,
        maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },

    // Location & Address
    address: {
        type: addressSchema,
        required: true,
    },
    location: {
        type: locationSchema,
        required: true,
    },

    // Contact Information
    contact: {
        type: contactSchema,
        required: true,
    },

    // Default Operating Hours (can be overridden per court)
    defaultOperatingHours: [venueOperatingHoursSchema],
    timezone: {
        type: String,
        default: 'Asia/Karachi',
    },

    // Venue Amenities (general venue facilities)
    amenities: {
        totalCourts: {
            type: Number,
            required: true,
            min: 1,
        },
        parking: {
            available: Boolean,
            capacity: Number,
            isFree: Boolean,
        },
        restrooms: Boolean,
        changingRooms: Boolean,
        showers: Boolean,
        lockers: {
            available: Boolean,
            count: Number,
        },
        cafeteria: Boolean,
        proShop: Boolean,
        waitingArea: Boolean,
        firstAid: Boolean,
        security: Boolean,
        cctv: Boolean,
        wifi: {
            available: Boolean,
            isFree: Boolean,
        },
        wheelchairAccessible: Boolean,
        childPlayArea: Boolean,
        custom: [{
            name: String,
            available: Boolean,
        }],
    },

    // Venue Images & Media
    media: [{
        type: {
            type: String,
            enum: ['image', 'video', 'virtual-tour'],
            required: true,
        },
        url: {
            type: String,
            required: true,
        },
        publicId: String,
        thumbnail: String,
        altText: String,
        isPrimary: {
            type: Boolean,
            default: false,
        },
        order: {
            type: Number,
            default: 0,
        },
    }],

    // Ownership & Management
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    managers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],

    // Venue Settings
    settings: {
        requiresApproval: {
            type: Boolean,
            default: false,
        },
        allowOnlineBooking: {
            type: Boolean,
            default: true,
        },
        allowWalkIn: {
            type: Boolean,
            default: true,
        },
        maxAdvanceBookingDays: {
            type: Number,
            default: 30,
        },
        cancellationPolicy: {
            allowCancellation: {
                type: Boolean,
                default: true,
            },
            cancellationWindowHours: {
                type: Number,
                default: 24,
            },
            refundPercentage: {
                type: Number,
                min: 0,
                max: 100,
                default: 100,
            },
        },
        paymentSettings: {
            acceptCash: {
                type: Boolean,
                default: true,
            },
            acceptCard: {
                type: Boolean,
                default: true,
            },
            acceptOnlinePayment: {
                type: Boolean,
                default: true,
            },
            requireDeposit: {
                type: Boolean,
                default: false,
            },
            depositPercentage: {
                type: Number,
                min: 0,
                max: 100,
                default: 0,
            },
        },
    },

    // Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'pending-verification', 'suspended'],
        default: 'pending-verification',
        index: true,
    },

    // Verification
    verification: {
        isVerified: {
            type: Boolean,
            default: false,
        },
        verifiedAt: Date,
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        documents: [{
            type: {
                type: String,
                enum: ['business-license', 'ownership-proof', 'id-card', 'tax-document', 'other'],
            },
            url: String,
            publicId: String,
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
            status: {
                type: String,
                enum: ['pending', 'approved', 'rejected'],
                default: 'pending',
            },
        }],
    },

    // Statistics
    stats: {
        totalCourts: {
            type: Number,
            default: 0,
        },
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
    },

    // SEO & Search
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
    isPromoted: {
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

// Geospatial Index for location-based queries
venueSchema.index({ location: '2dsphere' });

// Compound indexes
venueSchema.index({ status: 1, 'stats.averageRating': -1 });
venueSchema.index({ owner: 1, status: 1 });


// Text index for search
venueSchema.index({
    name: 'text',
    displayName: 'text',
    description: 'text',
    'address.city': 'text',
    tags: 'text'
});

// Pre-save middleware to generate slug
venueSchema.pre('save', async function (next) {
    if (this.isModified('name') && !this.slug) {
        const baseSlug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        let slug = baseSlug;
        let counter = 1;

        while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        this.slug = slug;
    }

    // Set display name if not provided
    if (!this.displayName) {
        this.displayName = this.name;
    }

    next();
});

// Virtual for primary image
venueSchema.virtual('primaryImage').get(function () {
    const primaryMedia = this.media.find(m => m.isPrimary && m.type === 'image');
    return primaryMedia || this.media.find(m => m.type === 'image');
});

// Virtual for full address string
venueSchema.virtual('fullAddress').get(function () {
    const { street, city, state, country, postalCode } = this.address;
    return `${street}, ${city}, ${state}, ${country}${postalCode ? ' ' + postalCode : ''}`;
});

// Static method to find nearby venues
venueSchema.statics.findNearby = function (longitude, latitude, maxDistance = 10000, limit = 20) {
    return this.find({
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                $maxDistance: maxDistance // in meters
            }
        },
        status: 'active'
    })
        .limit(limit)
        .select('-verification.documents');
};

// Static method to search venues
venueSchema.statics.searchVenues = function (searchParams) {
    const {
        text,
        city,
        state,
        latitude,
        longitude,
        maxDistance = 10000,
        minRating,
        amenities,
        status = 'active',
        sortBy = '-stats.averageRating',
        page = 1,
        limit = 20,
    } = searchParams;

    const query = { status };

    // Location-based search
    if (latitude && longitude) {
        query.location = {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                $maxDistance: maxDistance
            }
        };
    }

    // Text search
    if (text) {
        query.$text = { $search: text };
    }

    // Filter by city/state
    if (city) {
        query['address.city'] = new RegExp(city, 'i');
    }

    if (state) {
        query['address.state'] = new RegExp(state, 'i');
    }

    // Filter by rating
    if (minRating) {
        query['stats.averageRating'] = { $gte: minRating };
    }

    // Filter by amenities
    if (amenities && amenities.length > 0) {
        amenities.forEach(amenity => {
            query[`amenities.${amenity}`] = true;
        });
    }

    const skip = (page - 1) * limit;

    return this.find(query)
        .populate('owner', 'firstName lastName email')
        .select('-verification.documents')
        .sort(sortBy)
        .skip(skip)
        .limit(limit);
};

// Instance method to update statistics
venueSchema.methods.updateStats = async function () {
    const Court = mongoose.model('Court');

    const courts = await Court.find({ venue: this._id });

    this.stats.totalCourts = courts.length;

    // Calculate average rating from all courts
    const totalRatings = courts.reduce((sum, court) => sum + court.stats.averageRating, 0);
    this.stats.averageRating = courts.length > 0 ? totalRatings / courts.length : 0;

    // Sum up total bookings and revenue
    this.stats.totalBookings = courts.reduce((sum, court) => sum + court.stats.totalBookings, 0);
    this.stats.totalRevenue = courts.reduce((sum, court) => sum + court.stats.totalRevenue, 0);

    await this.save();
};

const Venue = mongoose.model('Venue', venueSchema);

module.exports = Venue;