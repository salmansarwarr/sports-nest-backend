const User = require("../../src/models/User.js");
const JWTUtils = require("../../src/utils/jwt.js");
const {register,login, resendVerificationEmail, getProfile, updateProfile, changePassword, forgotPassword, resetPassword, verifyEmail, refreshToken: _refreshToken} = require("../../src/controllers/authController.js");
const {
    sendWelcomeEmail: _sendWelcomeEmail,
    sendPasswordResetEmail: _sendPasswordResetEmail,
} = require("../../src/utils/email.js");

// Mock EmailService
jest.mock("../../src/utils/email", () => ({
    sendWelcomeEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
}));

describe("User Model", () => {
    describe("User Creation", () => {
        it("should create a user with valid data", async () => {
            const userData = {
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
                gender: "male"
            };

            const user = new User(userData);
            const savedUser = await user.save();

            expect(savedUser.firstName).toBe(userData.firstName);
            expect(savedUser.lastName).toBe(userData.lastName);
            expect(savedUser.email).toBe(userData.email);
            expect(savedUser.password).not.toBe(userData.password); // Should be hashed
            expect(savedUser.isEmailVerified).toBe(false);
            expect(savedUser.role).toBe("user");
            expect(savedUser.isActive).toBe(true);
        });
        it("should not create a user with invalid email", async () => {
            const userData = {
                firstName: "John",
                lastName: "Doe",
                email: "invalid-email",
                password: "Password123!",
                gender: "male"
            };

            const user = new User(userData);
            await expect(user.save()).rejects.toThrow();
        });

        it("should not create a user with short password", async () => {
            const userData = {
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "123",
                gender: "male"
            };

            const user = new User(userData);
            await expect(user.save()).rejects.toThrow();
        });

        it("should not create duplicate users with same email", async () => {
            const userData = {
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
                gender: "male"
            };

            const user1 = new User(userData);
            await user1.save();

            const user2 = new User(userData);
            await expect(user2.save()).rejects.toThrow();
        });
    });
    describe("Password Methods", () => {
        let user;
        beforeEach(async () => {
            user = new User({
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
            });
            await user.save();
        });

        it("should hash password before saving", async () => {
            expect(user.password).not.toBe("Password123!");
            expect(user.password.length).toBeGreaterThan(20);
        });

        it("should compare password correctly", async () => {
            const isValid = await user.comparePassword("Password123!");
            expect(isValid).toBe(true);

            const isInvalid = await user.comparePassword("wrongpassword");
            expect(isInvalid).toBe(false);
        });
    });
    describe("Token Methods", () => {
        let user;
        beforeEach(async () => {
            user = new User({
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
            });
            await user.save();
        });

        it("should create password reset token", () => {
            const token = user.createPasswordResetToken();

            expect(token).toBeDefined();
            expect(typeof token).toBe("string");
            expect(user.passwordResetToken).toBeDefined();
            expect(user.passwordResetExpires).toBeDefined();
            expect(user.passwordResetExpires.getTime()).toBeGreaterThan(
                Date.now()
            );
        });

        it("should create email verification token", () => {
            const token = user.createEmailVerificationToken();

            expect(token).toBeDefined();
            expect(typeof token).toBe("string");
            expect(user.emailVerificationToken).toBeDefined();
            expect(user.emailVerificationExpires).toBeDefined();
            expect(user.emailVerificationExpires.getTime()).toBeGreaterThan(
                Date.now()
            );
        });

        it("should add refresh token", () => {
            const refreshToken = "test-refresh-token";
            user.addRefreshToken(refreshToken);

            expect(user.refreshTokens).toHaveLength(1);
            expect(user.refreshTokens[0].token).toBe(refreshToken);
        });

        it("should remove refresh token", () => {
            const refreshToken = "test-refresh-token";
            user.addRefreshToken(refreshToken);
            user.removeRefreshToken(refreshToken);

            expect(user.refreshTokens).toHaveLength(0);
        });

        it("should limit refresh tokens to 5", () => {
            for (let i = 0; i < 7; i++) {
                user.addRefreshToken(`token-${i}`);
            }

            expect(user.refreshTokens).toHaveLength(5);
            expect(user.refreshTokens[0].token).toBe("token-2"); // First two should be removed
        });
    });
});
describe("JWT Utils", () => {
    const userId = "507f1f77bcf86cd799439011";
    describe("Token Generation", () => {
        it("should generate access token", () => {
            const token = JWTUtils.generateAccessToken(userId);
            expect(token).toBeDefined();
            expect(typeof token).toBe("string");
        });
        it("should generate refresh token", () => {
            const token = JWTUtils.generateRefreshToken(userId);
            expect(token).toBeDefined();
            expect(typeof token).toBe("string");
        });

        it("should generate token pair", () => {
            const tokens = JWTUtils.generateTokenPair(userId);
            expect(tokens.accessToken).toBeDefined();
            expect(tokens.refreshToken).toBeDefined();
        });
    });
    describe("Token Verification", () => {
        it("should verify valid access token", () => {
            const token = JWTUtils.generateAccessToken(userId);
            const decoded = JWTUtils.verifyAccessToken(token);
            expect(decoded.userId).toBe(userId);
            expect(decoded.type).toBe("access");
        });

        it("should verify valid refresh token", () => {
            const token = JWTUtils.generateRefreshToken(userId);
            const decoded = JWTUtils.verifyRefreshToken(token);

            expect(decoded.userId).toBe(userId);
            expect(decoded.type).toBe("refresh");
        });

        it("should reject invalid access token", () => {
            expect(() => {
                JWTUtils.verifyAccessToken("invalid-token");
            }).toThrow();
        });

        it("should reject refresh token as access token", () => {
            const refreshToken = JWTUtils.generateRefreshToken(userId);
            expect(() => {
                JWTUtils.verifyAccessToken(refreshToken);
            }).toThrow();
        });

        it("should reject access token as refresh token", () => {
            const accessToken = JWTUtils.generateAccessToken(userId);
            expect(() => {
                JWTUtils.verifyRefreshToken(accessToken);
            }).toThrow();
        });
    });
});
describe("Auth Controller", () => {
    let mockReq, mockRes, mockNext;
    beforeEach(() => {
        mockReq = {
            body: {},
            user: null,
            query: {},
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockNext = jest.fn();
        // Clear email service mocks
        _sendWelcomeEmail.mockClear();
        _sendPasswordResetEmail.mockClear();
    });
    describe("Register", () => {
        it("should register a new user successfully", async () => {
            mockReq.body = {
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
            };
            await register(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringContaining("registered successfully"),
                    data: expect.objectContaining({
                        user: expect.any(Object),
                        tokens: expect.objectContaining({
                            accessToken: expect.any(String),
                            refreshToken: expect.any(String),
                        }),
                    }),
                })
            );
            expect(_sendWelcomeEmail).toHaveBeenCalled();
        });

        it("should not register user with existing email", async () => {
            // Create first user
            const user = new User({
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
            });
            await user.save();

            // Try to create second user with same email
            mockReq.body = {
                firstName: "Jane",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
            };

            await register(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "User with this email already exists",
                })
            );
        });
    });
    describe("Login", () => {
        let user;
        beforeEach(async () => {
            user = new User({
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
            });
            await user.save();
        });

        it("should login with valid credentials", async () => {
            mockReq.body = {
                email: "john.doe@example.com",
                password: "Password123!",
            };

            await login(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: "Login successful",
                    data: expect.objectContaining({
                        user: expect.any(Object),
                        tokens: expect.objectContaining({
                            accessToken: expect.any(String),
                            refreshToken: expect.any(String),
                        }),
                    }),
                })
            );
        });

        it("should not login with invalid email", async () => {
            mockReq.body = {
                email: "wrong@example.com",
                password: "Password123!",
            };

            await login(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Invalid email or password",
                })
            );
        });

        it("should not login with invalid password", async () => {
            mockReq.body = {
                email: "john.doe@example.com",
                password: "wrongpassword",
            };

            await login(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Invalid email or password",
                })
            );
        });

        it("should update last login timestamp", async () => {
            const originalLastLogin = user.lastLogin;

            mockReq.body = {
                email: "john.doe@example.com",
                password: "Password123!",
            };

            await login(mockReq, mockRes, mockNext);

            const updatedUser = await User.findById(user._id);
            expect(updatedUser.lastLogin).not.toBe(originalLastLogin);
            expect(updatedUser.lastLogin).toBeInstanceOf(Date);
        });
    });
    describe("Refresh Token", () => {
        let user, refreshToken;
        beforeEach(async () => {
            user = new User({
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
            });
            await user.save();

            const tokens = JWTUtils.generateTokenPair(user._id);
            refreshToken = tokens.refreshToken;
            user.addRefreshToken(refreshToken);
            await user.save();
        });

        it("should refresh tokens with valid refresh token", async () => {
            mockReq.body = { refreshToken };

            await _refreshToken(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: "Tokens refreshed successfully",
                    data: expect.objectContaining({
                        tokens: expect.objectContaining({
                            accessToken: expect.any(String),
                            refreshToken: expect.any(String),
                        }),
                    }),
                })
            );
        });

        it("should not refresh with invalid refresh token", async () => {
            mockReq.body = { refreshToken: "invalid-token" };

            await _refreshToken(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Invalid or expired refresh token",
                })
            );
        });

        it("should not refresh with non-existent refresh token", async () => {
            user.refreshTokens = []; 
            await user.save();
            const anotherToken = JWTUtils.generateRefreshToken(user._id);
            mockReq.body = { refreshToken: anotherToken };

            await _refreshToken(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Invalid refresh token",
                })
            );
        });
    });

    describe("Profile Management", () => {
        let user;
        beforeEach(async () => {
            user = new User({
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
            });
            await user.save();
            mockReq.user = user;
        });

        it("should get user profile", async () => {
            await getProfile(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        user: expect.objectContaining({
                            firstName: "John",
                            lastName: "Doe",
                            email: "john.doe@example.com",
                        }),
                    }),
                })
            );
        });

        it("should update user profile", async () => {
            mockReq.body = {
                firstName: "Jane",
                phone: "+1234567890",
            };

            await updateProfile(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: "Profile updated successfully",
                    data: expect.objectContaining({
                        user: expect.objectContaining({
                            firstName: "Jane",
                            phone: "+1234567890",
                        }),
                    }),
                })
            );
        });

        it("should change password successfully", async () => {
            mockReq.body = {
                currentPassword: "Password123!",
                newPassword: "NewPassword123!",
            };

            await changePassword(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringContaining(
                        "Password changed successfully"
                    ),
                })
            );

            // Verify old password no longer works
            const updatedUser = await User.findById(user._id).select("+password");
            const oldPasswordValid = await updatedUser.comparePassword(
                "Password123!"
            );
            const newPasswordValid = await updatedUser.comparePassword(
                "NewPassword123!"
            );

            expect(oldPasswordValid).toBe(false);
            expect(newPasswordValid).toBe(true);
        });

        it("should not change password with wrong current password", async () => {
            mockReq.body = {
                currentPassword: "WrongPassword123!",
                newPassword: "NewPassword123!",
            };

            await changePassword(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Current password is incorrect",
                })
            );
        });
    });
    describe("Password Reset", () => {
        let user;
        beforeEach(async () => {
            user = new User({
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
            });
            await user.save();
        });

        it("should send password reset email for existing user", async () => {
            mockReq.body = { email: "john.doe@example.com" };

            await forgotPassword(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringContaining(
                        "Password reset link sent"
                    ),
                })
            );
            expect(_sendPasswordResetEmail).toHaveBeenCalled();
        });

        it("should respond positively for non-existent email", async () => {
            mockReq.body = { email: "nonexistent@example.com" };

            await forgotPassword(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringContaining("If the email exists"),
                })
            );
        });

        it("should reset password with valid token", async () => {
            const resetToken = user.createPasswordResetToken();
            await user.save();

            mockReq.body = {
                token: resetToken,
                password: "NewPassword123!",
            };

            await resetPassword(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringContaining(
                        "Password reset successful"
                    ),
                })
            );

            // Verify new password works
            const updatedUser = await User.findById(user._id).select("+password");
            const isValid = await updatedUser.comparePassword(
                "NewPassword123!"
            );
            expect(isValid).toBe(true);
        });

        it("should not reset password with invalid token", async () => {
            mockReq.body = {
                token: "invalid-token",
                password: "NewPassword123!",
            };

            await resetPassword(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Invalid or expired reset token",
                })
            );
        });
    });
    describe("Email Verification", () => {
        let user;
        beforeEach(async () => {
            user = new User({
                firstName: "John",
                lastName: "Doe",
                email: "john.doe@example.com",
                password: "Password123!",
            });
            await user.save();
            mockReq.user = user;
        });

        it("should verify email with valid token", async () => {
            const verificationToken = user.createEmailVerificationToken();
            await user.save();

            mockReq.query = { token: verificationToken };

            await verifyEmail(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: "Email verified successfully",
                })
            );

            // Verify user is marked as verified
            const updatedUser = await User.findById(user._id);
            expect(updatedUser.isEmailVerified).toBe(true);
        });

        it("should not verify email with invalid token", async () => {
            mockReq.query = { token: "invalid-token" };

            await verifyEmail(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Invalid or expired verification token",
                })
            );
        });

        it("should resend verification email", async () => {
            await resendVerificationEmail(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: "Verification email sent successfully",
                })
            );
            expect(_sendWelcomeEmail).toHaveBeenCalled();
        });

        it("should not resend verification email if already verified", async () => {
            user.isEmailVerified = true;
            await user.save();

            await resendVerificationEmail(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Email is already verified",
                })
            );
        });
    });
});
