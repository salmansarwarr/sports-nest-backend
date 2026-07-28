const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const WalletTransaction = require("./WalletTransaction");
const LoyaltyTransaction = require("./LoyaltyTransaction");
const { POINTS_TO_WALLET_RATE } = require("../config/loyaltyRates");

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
        // Denormalized cache of the running total from WalletTransaction -
        // see creditWallet/debitWallet below for the only sanctioned way to
        // mutate this field.
        walletBalance: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Denormalized cache of the running total from LoyaltyTransaction -
        // see earnLoyaltyPoints/redeemLoyaltyPoints below for the only
        // sanctioned way to mutate this field.
        loyaltyPoints: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Lazily generated (see src/utils/referral.js) rather than a static
        // schema default, since it must be unique per user.
        referralCode: {
            type: String,
            unique: true,
            sparse: true,
            uppercase: true,
        },
        // Set once at registration if a valid referralCode was supplied;
        // never mutated afterward.
        referredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        twoFactorAuth: {
            enabled: {
                type: Boolean,
                default: false,
            },
            // select:false is the primary defense; toJSON.transform below
            // strips these too as defense-in-depth for the one code path
            // that must explicitly .select('+twoFactorAuth.secret').
            secret: {
                type: String,
                select: false,
            },
            // Set during /2fa/setup, promoted to `secret` only once the
            // user proves possession via /2fa/enable.
            pendingSecret: {
                type: String,
                select: false,
            },
            backupCodes: [{
                codeHash: String,
                usedAt: Date,
            }],
        },
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
                if (ret.twoFactorAuth) {
                    delete ret.twoFactorAuth.secret;
                    delete ret.twoFactorAuth.pendingSecret;
                    delete ret.twoFactorAuth.backupCodes;
                }
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

// Credit the wallet and record a matching ledger entry. Returns the updated
// user, or null if amount is invalid or the user doesn't exist.
userSchema.statics.creditWallet = async function (userId, amount, { source, description, booking, gatewayPaymentIntentId } = {}) {
    if (!amount || amount <= 0) return null;

    const user = await this.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: amount } },
        { new: true }
    );
    if (!user) return null;

    await WalletTransaction.create({
        user: userId,
        type: 'credit',
        amount,
        balanceAfter: user.walletBalance,
        source,
        description,
        booking,
        gatewayPaymentIntentId,
    });

    return user;
};

// Debit the wallet and record a matching ledger entry. The update is
// atomically guarded on walletBalance >= amount so concurrent debits can
// never overdraw the balance; returns null (no-op) if the balance is
// insufficient at write time, or if amount is invalid.
userSchema.statics.debitWallet = async function (userId, amount, { source, description, booking } = {}) {
    if (!amount || amount <= 0) return null;

    const user = await this.findOneAndUpdate(
        { _id: userId, walletBalance: { $gte: amount } },
        { $inc: { walletBalance: -amount } },
        { new: true }
    );
    if (!user) return null;

    await WalletTransaction.create({
        user: userId,
        type: 'debit',
        amount,
        balanceAfter: user.walletBalance,
        source,
        description,
        booking,
    });

    return user;
};

// Award loyalty points and record a matching ledger entry. Returns the
// updated user, or null if points is invalid or the user doesn't exist.
userSchema.statics.earnLoyaltyPoints = async function (userId, points, { source, description, booking } = {}) {
    if (!points || points <= 0) return null;

    const user = await this.findByIdAndUpdate(
        userId,
        { $inc: { loyaltyPoints: points } },
        { new: true }
    );
    if (!user) return null;

    await LoyaltyTransaction.create({
        user: userId,
        type: 'earn',
        points,
        pointsBalanceAfter: user.loyaltyPoints,
        source,
        description,
        booking,
    });

    return user;
};

// Redeem loyalty points into wallet credit at POINTS_TO_WALLET_RATE. The
// points debit is atomically guarded on loyaltyPoints >= points (same
// race-safety idiom as debitWallet); the wallet credit only happens once
// that debit succeeds. Returns the updated user (reflecting both balances),
// or null if points is invalid or the balance is insufficient.
userSchema.statics.redeemLoyaltyPoints = async function (userId, points, { description } = {}) {
    if (!points || points <= 0) return null;

    const user = await this.findOneAndUpdate(
        { _id: userId, loyaltyPoints: { $gte: points } },
        { $inc: { loyaltyPoints: -points } },
        { new: true }
    );
    if (!user) return null;

    await LoyaltyTransaction.create({
        user: userId,
        type: 'redeem',
        points,
        pointsBalanceAfter: user.loyaltyPoints,
        source: 'redemption',
        description,
    });

    const credited = await this.creditWallet(userId, points * POINTS_TO_WALLET_RATE, {
        source: 'loyalty_redemption',
        description: description || `Redeemed ${points} loyalty points`,
    });

    return credited || user;
};

module.exports = mongoose.model("User", userSchema);
