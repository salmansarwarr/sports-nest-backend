const crypto = require('crypto');
const User = require('../models/User.js');
const JWTUtils = require('../utils/jwt.js');
const EmailService = require('../utils/email.js');

class AuthController {
    // Register new user
    static async register(req, res, next) {
        try {
            const { firstName, lastName, email, password, phone, dateOfBirth, gender, profilePicture } =
                req.body;

            // Check if user already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: "User with this email already exists",
                });
            }

            // Create new user
            const user = new User({
                firstName,
                lastName,
                email,
                password,
                phone,
                dateOfBirth,
                gender,
                profilePicture
            });

            // Generate email verification token
            const verificationToken = user.createEmailVerificationToken();
            await user.save();

            // Send verification email
            try {
                await EmailService.sendWelcomeEmail(user, verificationToken);
            } catch (emailError) {
                console.error("Failed to send verification email:", emailError);
                // Don't fail registration if email fails
            }

            // Generate tokens
            const tokens = JWTUtils.generateTokenPair(user._id);
            user.addRefreshToken(tokens.refreshToken);
            await user.save();

            res.status(201).json({
                success: true,
                message:
                    "User registered successfully. Please check your email for verification.",
                data: {
                    user: user.toJSON(),
                    tokens: {
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    // Login user
    static async login(req, res, next) {
        try {
            const { email, password } = req.body;

            // Check if user exists and get password
            const user = await User.findOne({ email }).select("+password");

            if (!user || !user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid credentials",
                });
            }

            if (!user.password || user.password === '') {
                return res.status(400).json({
                  success: false,
                  message: "This account is registered with Google. Please login via Google.",
                });
            }

            if(!user.isEmailVerified) {
                return res.status(401).json({
                    success: false,
                    message: "Please verify your email",
                });
            }

            // Check password
            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid credentials",
                });
            }

            // Update last login
            user.lastLogin = new Date();

            // Generate tokens
            const tokens = JWTUtils.generateTokenPair(user._id);
            user.addRefreshToken(tokens.refreshToken);
            await user.save();

            res.json({
                success: true,
                message: "Login successful",
                data: {
                    user: user.toJSON(),
                    tokens: {
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    // Refresh access token
    static async refreshToken(req, res, next) {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({
                    success: false,
                    message: "Refresh token is required",
                });
            }

            // Verify refresh token
            const decoded = JWTUtils.verifyRefreshToken(refreshToken);

            // Find user and check if refresh token exists
            const user = await User.findById(decoded.userId);
            if (!user || !user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid refresh token",
                });
            }

            const tokenExists = user.refreshTokens.some(
                (rt) => rt.token === refreshToken
            );
            if (!tokenExists) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid refresh token",
                });
            }

            // Generate new tokens
            const newTokens = JWTUtils.generateTokenPair(user._id);

            // Remove old refresh token and add new one
            user.removeRefreshToken(refreshToken);
            user.addRefreshToken(newTokens.refreshToken);
            await user.save();

            res.json({
                success: true,
                message: "Tokens refreshed successfully",
                data: {
                    tokens: {
                        accessToken: newTokens.accessToken,
                        refreshToken: newTokens.refreshToken,
                    },
                },
            });
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired refresh token",
            });
        }
    }

    // Logout user
    static async logout(req, res, next) {
        try {
            const { refreshToken } = req.body;

            if (refreshToken) {
                req.user.removeRefreshToken(refreshToken);
                await req.user.save();
            }

            res.json({
                success: true,
                message: "Logout successful",
            });
        } catch (error) {
            next(error);
        }
    }

    // Logout from all devices
    static async logoutAll(req, res, next) {
        try {
            req.user.refreshTokens = [];
            await req.user.save();

            res.json({
                success: true,
                message: "Logged out from all devices successfully",
            });
        } catch (error) {
            next(error);
        }
    }

    // Get current user profile
    static async getProfile(req, res, next) {
        try {
            res.json({
                success: true,
                data: {
                    user: req.user.toJSON(),
                },
            });
        } catch (error) {
            next(error);
        }
    }

    // Update user profile
    static async updateProfile(req, res, next) {
        try {
            const allowedUpdates = [
                "firstName",
                "lastName",
                "phone",
                "dateOfBirth",
                "gender",
                "profilePicture",
            ];
            const updates = {};

            // Only allow specific fields to be updated
            Object.keys(req.body).forEach((key) => {
                if (allowedUpdates.includes(key)) {
                    updates[key] = req.body[key];
                }
            });

            const user = await User.findByIdAndUpdate(req.user._id, updates, {
                new: true,
                runValidators: true,
            });
            res.json({
                success: true,
                message: "Profile updated successfully",
                data: {
                    user: user.toJSON(),
                },
            });
        } catch (error) {
            next(error);
        }
    }
    // Change password
    static async changePassword(req, res, next) {
        try {
            const { currentPassword, newPassword } = req.body;

            // Get user with password
            const user = await User.findById(req.user._id).select("+password");

            // Check current password
            const isCurrentPasswordValid = await user.comparePassword(
                currentPassword
            );
            
            if (!isCurrentPasswordValid) {
                return res.status(400).json({
                    success: false,
                    message: "Current password is incorrect",
                });
            }

            // Update password
            user.password = newPassword;
            await user.save();

            // Invalidate all refresh tokens for security
            user.refreshTokens = [];
            await user.save();

            res.json({
                success: true,
                message: "Password changed successfully. Please login again.",
            });
        } catch (error) {
            next(error);
        }
    }
    // Forgot password
    static async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;
            const user = await User.findOne({ email });
            if (!user) {
                // Don't reveal if email exists or not
                return res.json({
                    success: true,
                    message:
                        "If the email exists, a password reset link has been sent.",
                });
            }

            // Generate reset token
            const resetToken = user.createPasswordResetToken();
            await user.save();

            // Send reset email
            try {
                await EmailService.sendPasswordResetEmail(user, resetToken);
            } catch (emailError) {
                user.passwordResetToken = undefined;
                user.passwordResetExpires = undefined;
                await user.save();

                return res.status(500).json({
                    success: false,
                    message: "Email could not be sent. Please try again later.",
                });
            }

            res.json({
                success: true,
                message: "Password reset link sent to your email.",
            });
        } catch (error) {
            next(error);
        }
    }
    // Reset password
    static async resetPassword(req, res, next) {
        try {
            const { token, password } = req.body;

            // Hash token and find user
            const hashedToken = crypto.createHash("sha256")
                .update(token)
                .digest("hex");

            const user = await User.findOne({
                passwordResetToken: hashedToken,
                passwordResetExpires: { $gt: Date.now() },
            });

            if (!user) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid or expired reset token",
                });
            }

            // Update password and clear reset token
            user.password = password;
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;

            // Invalidate all refresh tokens for security
            user.refreshTokens = [];
            await user.save();

            res.json({
                success: true,
                message:
                    "Password reset successful. Please login with your new password.",
            });
        } catch (error) {
            next(error);
        }
    }
    // Verify email
    static async verifyEmail(req, res, next) {
        try {
            const { token } = req.query;
            if (!token) {
                return res.status(400).json({
                    success: false,
                    message: "Verification token is required",
                });
            }

            // Hash token and find user
            const hashedToken = crypto.createHash("sha256")
                .update(token)
                .digest("hex");

            const user = await User.findOne({
                emailVerificationToken: hashedToken,
                emailVerificationExpires: { $gt: Date.now() },
            });

            if (!user) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid or expired verification token",
                });
            }

            // Update user verification status
            user.isEmailVerified = true;
            user.emailVerificationToken = undefined;
            user.emailVerificationExpires = undefined;
            await user.save();

            res.json({
                success: true,
                message: "Email verified successfully",
            });
        } catch (error) {
            next(error);
        }
    }
    // Resend verification email
    static async resendVerificationEmail(req, res, next) {
        try {
            const user = req.user;
            if (user.isEmailVerified) {
                return res.status(400).json({
                    success: false,
                    message: "Email is already verified",
                });
            }

            // Generate new verification token
            const verificationToken = user.createEmailVerificationToken();
            await user.save();

            // Send verification email
            try {
                await EmailService.sendWelcomeEmail(user, verificationToken);
            } catch (emailError) {
                return res.status(500).json({
                    success: false,
                    message: "Email could not be sent. Please try again later.",
                });
            }

            res.json({
                success: true,
                message: "Verification email sent successfully",
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = AuthController;
