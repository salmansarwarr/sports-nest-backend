const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
    {
        gender: {
            type: String,
            enum: ["male", "female", "other"],
        },
        profilePicture: {
            url: {
                type: String,
                default: "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png?20150327203541",
            },
            publicId: {
                type: String,
                default: null,
            },
        },
        firstName: {
            type: String,
            required: [true, "First name is required"],
            trim: true,
            maxlength: [50, "First name cannot be more than 50 characters"],
        },
        lastName: {
            type: String,
            required: [true, "Last name is required"],
            trim: true,
            maxlength: [50, "Last name cannot be more than 50 characters"],
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            // Deliberately simple (no nested quantifiers) - the previous
            // pattern (\w+([.-]?\w+)*@...(\.\w{2,3})+) could catastrophically
            // backtrack (ReDoS) on inputs its TLD group can't match (e.g. any
            // TLD longer than 3 chars, like ".info" or ".local"), hanging the
            // single-threaded process for minutes on a single save(). Route-level
            // express-validator isEmail() (a mature, non-regex library) is the
            // real validation; this is just a cheap sanity check.
            match: [
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                "Please enter a valid email",
            ],
        },
        password: {
            type: String,
            minlength: [8, "Password must be at least 8 characters"],
            select: false,
        },
        phone: {
            type: String,
            match: [/^\+?[\d\s-()]+$/, "Please enter a valid phone number"],
        },
        dateOfBirth: {
            type: Date,
            validate: {
                validator: function (date) {
                    return date < new Date();
                },
                message: "Date of birth must be in the past",
            },
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        role: {
            type: String,
            enum: ['user', 'owner', 'manager', 'admin'],
            default: 'user'
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        provider: {
            type: String,
            enum: ['manual', 'google'],
            default: 'manual',
        },
        googleId: {
            type: String,
            default: null,
        },
        lastLogin: Date,
        passwordResetToken: String,
        passwordResetExpires: Date,
        emailVerificationToken: String,
        emailVerificationExpires: Date,
        refreshTokens: [
            {
                token: String,
                createdAt: {
                    type: Date,
                    default: Date.now,
                    expires: 2592000, // 30 days
                },
            },
        ],
        preferences: {
            notifications: {
                email: {
                    type: Boolean,
                    default: true,
                },
                whatsapp: {
                    type: Boolean,
                    default: false,
                },
                push: {
                    type: Boolean,
                    default: true,
                },
            },
            language: {
                type: String,
                default: 'en',
            },
            currency: {
                type: String,
                default: 'PKR',
            },
        },
        recentlyViewed: [
            {
                itemType: {
                    type: String,
                    enum: ['Court', 'Venue'],
                },
                itemId: {
                    type: mongoose.Schema.Types.ObjectId,
                    refPath: 'recentlyViewed.itemType',
                },
                viewedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        deviceTokens: [
            {
                token: String,
                platform: {
                    type: String,
                    enum: ['ios', 'android', 'web'],
                },
                addedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        // Set on self-service GDPR account deletion (anonymization) - distinct
        // from an admin merely deactivating an account via isActive:false.
        deletedAt: Date,
    },
    {
        timestamps: true,
        toJSON: {
            transform: function (doc, ret) {
                delete ret.password;
                delete ret.passwordResetToken;
                delete ret.passwordResetExpires;
                delete ret.emailVerificationToken;
                delete ret.emailVerificationExpires;
                delete ret.refreshTokens;
                return ret;
            },
        },
    }
);

// Index for performance
userSchema.index({ passwordResetToken: 1 });
userSchema.index({ emailVerificationToken: 1 });

// Hash password before saving
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();

    this.password = await bcrypt.hash(
        this.password,
        parseInt(process.env.BCRYPT_ROUNDS) || 12
    );
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function () {
    const resetToken = crypto.randomBytes(32).toString("hex");

    this.passwordResetToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    return resetToken;
};

// Generate email verification token
userSchema.methods.createEmailVerificationToken = function () {
    const verificationToken = crypto.randomBytes(32).toString("hex");

    this.emailVerificationToken = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex");

    this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    return verificationToken;
};

// Add refresh token
userSchema.methods.addRefreshToken = function (token) {
    this.refreshTokens.push({ token });

    // Keep only last 5 refresh tokens
    if (this.refreshTokens.length > 5) {
        this.refreshTokens = this.refreshTokens.slice(-5);
    }
};

// Remove refresh token
userSchema.methods.removeRefreshToken = function (token) {
    this.refreshTokens = this.refreshTokens.filter((rt) => rt.token !== token);
};

// Track a recently viewed court/venue, most-recent-first, capped at 20 entries
userSchema.methods.addRecentlyViewed = function (itemType, itemId) {
    this.recentlyViewed = this.recentlyViewed.filter(
        (rv) => !(rv.itemType === itemType && rv.itemId.toString() === itemId.toString())
    );

    this.recentlyViewed.unshift({ itemType, itemId });

    if (this.recentlyViewed.length > 20) {
        this.recentlyViewed = this.recentlyViewed.slice(0, 20);
    }
};

// Register a push notification device token
userSchema.methods.addDeviceToken = function (token, platform) {
    this.deviceTokens = this.deviceTokens.filter((dt) => dt.token !== token);
    this.deviceTokens.push({ token, platform });

    if (this.deviceTokens.length > 10) {
        this.deviceTokens = this.deviceTokens.slice(-10);
    }
};

// Unregister a push notification device token
userSchema.methods.removeDeviceToken = function (token) {
    this.deviceTokens = this.deviceTokens.filter((dt) => dt.token !== token);
};

module.exports = mongoose.model("User", userSchema);
