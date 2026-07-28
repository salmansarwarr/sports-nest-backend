const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: [true, 'Code is required'],
        unique: true,
        uppercase: true,
        trim: true,
    },

    description: {
        type: String,
        trim: true,
    },

    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: [true, 'Discount type is required'],
    },

    discountValue: {
        type: Number,
        required: [true, 'Discount value is required'],
        min: [0, 'Discount value cannot be negative'],
        validate: {
            validator: function (value) {
                return this.discountType !== 'percentage' || value <= 100;
            },
            message: 'Percentage discount cannot exceed 100',
        },
    },

    maxDiscountAmount: {
        type: Number,
        min: 0,
    },

    minBookingAmount: {
        type: Number,
        default: 0,
        min: 0,
    },

    validFrom: {
        type: Date,
        required: [true, 'Valid-from date is required'],
    },

    validUntil: {
        type: Date,
        required: [true, 'Valid-until date is required'],
        validate: {
            validator: function (value) {
                return value > this.validFrom;
            },
            message: 'Valid-until date must be after valid-from date',
        },
    },

    usageLimit: {
        type: Number,
        min: 1,
        // null/undefined = unlimited
    },

    usageLimitPerUser: {
        type: Number,
        default: 1,
        min: 1,
    },

    usedCount: {
        type: Number,
        default: 0,
        min: 0,
    },

    applicableVenues: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Venue',
    }],

    applicableCourts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Court',
    }],

    isActive: {
        type: Boolean,
        default: true,
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {
    timestamps: true,
});

// Check whether this promo code can be applied to a booking of the given amount/court/venue
promoCodeSchema.methods.isValidFor = function (subtotal, courtId, venueId) {
    const now = new Date();

    if (!this.isActive) {
        return { valid: false, reason: 'Promo code is not active' };
    }

    if (now < this.validFrom || now > this.validUntil) {
        return { valid: false, reason: 'Promo code is not valid at this time' };
    }

    if (subtotal < this.minBookingAmount) {
        return { valid: false, reason: `Minimum booking amount of ${this.minBookingAmount} required` };
    }

    if (this.applicableVenues.length > 0 && !this.applicableVenues.some(v => v.toString() === venueId.toString())) {
        return { valid: false, reason: 'Promo code is not applicable to this venue' };
    }

    if (this.applicableCourts.length > 0 && !this.applicableCourts.some(c => c.toString() === courtId.toString())) {
        return { valid: false, reason: 'Promo code is not applicable to this court' };
    }

    if (this.usageLimit && this.usedCount >= this.usageLimit) {
        return { valid: false, reason: 'Promo code usage limit reached' };
    }

    return { valid: true };
};

// Compute the discount amount for a given subtotal, applying the max-discount cap if set
promoCodeSchema.methods.calculateDiscount = function (subtotal) {
    let discount = this.discountType === 'percentage'
        ? (subtotal * this.discountValue) / 100
        : this.discountValue;

    if (this.maxDiscountAmount) {
        discount = Math.min(discount, this.maxDiscountAmount);
    }

    return Math.min(discount, subtotal);
};

const PromoCode = mongoose.model('PromoCode', promoCodeSchema);

module.exports = PromoCode;
