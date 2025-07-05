const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app.js'); 
const User = require('../../src/models/User.js'); 
const { createHash } = require('crypto');

describe('Authentication Routes E2E Tests', () => {
    let server;
    let testUser;
    let accessToken;
    let refreshToken;

    // Test data
    const validUserData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '+1234567890',
        dateOfBirth: '1990-01-01',
        gender: "male"
    };

    const loginData = {
        email: 'john.doe@example.com',
        password: 'Password123!'
    };

    const registerAndLogin = async () => {
        await request(app).post('/api/auth/register').send(validUserData);
        const res = await request(app).post('/api/auth/login').send(loginData);
        accessToken = res.body.data.tokens.accessToken;
        refreshToken = res.body.data.tokens.refreshToken;
    };

    beforeAll(async () => {
        // Start server
        server = app.listen(0);
        
        // Connect to test database
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.TEST_DATABASE_URL);
        }
    });

    afterAll(async () => {
        // Clean up and close connections
        await mongoose.connection.close();
        if (server) {
            server.close();
        }
    });

    beforeEach(async () => {
        // Clean database before each test
        await User.deleteMany({});
    });

    afterEach(async () => {
        // Clean up after each test
        await User.deleteMany({});
    });

    describe('POST /api/auth/register', () => {
        it('should register a new user successfully', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send(validUserData)
                .expect(201);

            expect(response.body).toMatchObject({
                success: true,
                message: expect.stringContaining('registered successfully')
            });
            expect(response.body.data).toHaveProperty('user');
            expect(response.body.data).toHaveProperty('tokens');
            expect(response.body.data.user.email).toBe(validUserData.email);
            expect(response.body.data.user).not.toHaveProperty('password');
        });

        it('should fail with invalid email format', async () => {
            const invalidData = { ...validUserData, email: 'invalid-email' };
            
            const response = await request(app)
                .post('/api/auth/register')
                .send(invalidData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Validation failed');
        });

        it('should fail with weak password', async () => {
            const weakPasswordData = { ...validUserData, password: '123', confirmPassword: '123' };
            
            const response = await request(app)
                .post('/api/auth/register')
                .send(weakPasswordData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should fail when passwords do not match', async () => {
            const mismatchData = { ...validUserData, confirmPassword: 'DifferentPassword123!' };
            
            const response = await request(app)
                .post('/api/auth/register')
                .send(mismatchData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should fail when user already exists', async () => {
            // Create user first
            await request(app)
                .post('/api/auth/register')
                .send(validUserData)
                .expect(201);

            // Try to register again
            const response = await request(app)
                .post('/api/auth/register')
                .send(validUserData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('already exists');
        });

        it('should fail with missing required fields', async () => {
            const incompleteData = {
                firstName: 'John',
                email: 'john@example.com'
                // Missing required fields
            };
            
            const response = await request(app)
                .post('/api/auth/register')
                .send(incompleteData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/auth/login', () => {
        beforeEach(async () => {
            // Create a test user
            const registerResponse = await request(app)
                .post('/api/auth/register')
                .send(validUserData);
            
            testUser = registerResponse.body.data.user;
        });

        it('should login successfully with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send(loginData)
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                message: expect.stringContaining('successful')
            });
            expect(response.body.data).toHaveProperty('user');
            expect(response.body.data).toHaveProperty('tokens');
            expect(response.body.data.tokens).toHaveProperty('accessToken');
            expect(response.body.data.tokens).toHaveProperty('refreshToken');
            
            // Store tokens for other tests
            accessToken = response.body.data.tokens.accessToken;
            refreshToken = response.body.data.tokens.refreshToken;
        });

        it('should fail with invalid email', async () => {
            const invalidLogin = { ...loginData, email: 'wrong@example.com' };
            
            const response = await request(app)
                .post('/api/auth/login')
                .send(invalidLogin)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Invalid credentials');
        });

        it('should fail with invalid password', async () => {
            const invalidLogin = { ...loginData, password: 'wrongpassword' };
            
            const response = await request(app)
                .post('/api/auth/login')
                .send(invalidLogin)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Invalid credentials');
        });

        it('should fail with missing fields', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com' })
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/auth/refresh', () => {
        beforeEach(async () => {
            // Register and login to get tokens
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);
            
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send(loginData);

            
            refreshToken = loginResponse.body.data.tokens.refreshToken;
        });

        it('should refresh tokens successfully', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.tokens).toHaveProperty('accessToken');
            expect(response.body.data.tokens).toHaveProperty('refreshToken');
        });

        it('should fail with invalid refresh token', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: 'invalid-token' })
                .expect(401);

            expect(response.body.success).toBe(false);
        });

        it('should fail with missing refresh token', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .send({})
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/auth/logout', () => {
        beforeEach(async () => {
            // Register and login to get tokens
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);
            
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send(loginData);
            
            accessToken = loginResponse.body.data.tokens.accessToken;
            refreshToken = loginResponse.body.data.tokens.refreshToken;
        });

        it('should logout successfully', async () => {
            const response = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ refreshToken })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Logout successful');
        });

        it('should fail without authentication', async () => {
            const response = await request(app)
                .post('/api/auth/logout')
                .send({ refreshToken })
                .expect(401);

            expect(response.body.success).toBe(false);
        });

        it('should fail with invalid token', async () => {
            const response = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', 'Bearer invalid-token')
                .send({ refreshToken })
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/auth/logout-all', () => {
        beforeEach(async () => {
            // Register and login to get tokens
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);
            
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send(loginData);
            
            accessToken = loginResponse.body.data.tokens.accessToken;
        });

        it('should logout from all devices successfully', async () => {
            const response = await request(app)
                .post('/api/auth/logout-all')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('all devices');
        });

        it('should fail without authentication', async () => {
            const response = await request(app)
                .post('/api/auth/logout-all')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/auth/profile', () => {
        beforeEach(async () => {
            // Register and login to get tokens
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);
            
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send(loginData);
            
            accessToken = loginResponse.body.data.tokens.accessToken;
        });

        it('should get user profile successfully', async () => {
            const response = await request(app)
                .get('/api/auth/profile')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user).toMatchObject({
                firstName: validUserData.firstName,
                lastName: validUserData.lastName,
                email: validUserData.email
            });
            expect(response.body.data.user).not.toHaveProperty('password');
        });

        it('should fail without authentication', async () => {
            const response = await request(app)
                .get('/api/auth/profile')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('PUT /api/auth/profile', () => {
        beforeEach(async () => {
            // Register and login to get tokens
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);
            
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send(loginData);
            
            accessToken = loginResponse.body.data.tokens.accessToken;
        });

        it('should update profile successfully', async () => {
            const updateData = {
                firstName: 'Jane',
                lastName: 'Smith',
                phone: '+9876543210'
            };

            const response = await request(app)
                .put('/api/auth/profile')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user).toMatchObject(updateData);
        });

        it('should fail with invalid data', async () => {
            const invalidData = {
                firstName: 'A', // Too short
                phone: 'invalid-phone'
            };

            const response = await request(app)
                .put('/api/auth/profile')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(invalidData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should fail without authentication', async () => {
            const response = await request(app)
                .put('/api/auth/profile')
                .send({ firstName: 'Jane' })
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('PUT /api/auth/change-password', () => {
        beforeEach(async () => {
            // Register and login to get tokens
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);
            
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send(loginData);
            
            accessToken = loginResponse.body.data.tokens.accessToken;
        });

        it('should change password successfully', async () => {
            const changePasswordData = {
                currentPassword: validUserData.password,
                newPassword: 'NewPassword123!',
                confirmNewPassword: 'NewPassword123!'
            };

            const response = await request(app)
                .put('/api/auth/change-password')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(changePasswordData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Password changed');
        });

        it('should fail with incorrect current password', async () => {
            const changePasswordData = {
                currentPassword: 'WrongPassword123!',
                newPassword: 'NewPassword123!',
                confirmNewPassword: 'NewPassword123!'
            };

            const response = await request(app)
                .put('/api/auth/change-password')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(changePasswordData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should fail when new passwords do not match', async () => {
            const changePasswordData = {
                currentPassword: validUserData.password,
                newPassword: 'NewPassword123!',
                confirmNewPassword: 'DifferentPassword123!'
            };

            const response = await request(app)
                .put('/api/auth/change-password')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(changePasswordData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should fail without authentication', async () => {
            const response = await request(app)
                .put('/api/auth/change-password')
                .send({
                    currentPassword: 'password',
                    newPassword: 'newpassword',
                    confirmNewPassword: 'newpassword'
                })
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/auth/forgot-password', () => {
        beforeEach(async () => {
            // Create a test user
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);
        });

        it('should send password reset email for existing user', async () => {
            const response = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: validUserData.email })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('reset link sent');
        });

        it('should return success even for non-existing email (security)', async () => {
            const response = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'nonexistent@example.com' })
                .expect(200);

            expect(response.body.success).toBe(true);
        });

        it('should fail with invalid email format', async () => {
            const response = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'invalid-email' })
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should fail with missing email', async () => {
            const response = await request(app)
                .post('/api/auth/forgot-password')
                .send({})
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/auth/reset-password', () => {
        let resetToken;
        let user;

        beforeEach(async () => {
            // Create user and generate reset token
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);

            user = await User.findOne({ email: validUserData.email });
            
            // Generate reset token manually (simulating the process)
            const crypto = require('crypto');
            const plainToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = createHash('sha256').update(plainToken).digest('hex');
            
            user.passwordResetToken = hashedToken;
            user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
            await user.save();
            
            resetToken = plainToken;
        });

        it('should reset password successfully with valid token', async () => {
            const resetData = {
                token: resetToken,
                password: 'NewPassword123!',
                confirmPassword: 'NewPassword123!'
            };

            const response = await request(app)
                .post('/api/auth/reset-password')
                .send(resetData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Password reset successful');

            // Verify user can login with new password
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: validUserData.email,
                    password: 'NewPassword123!'
                })
                .expect(200);

            expect(loginResponse.body.success).toBe(true);
        });

        it('should fail with invalid token', async () => {
            const resetData = {
                token: 'invalid-token',
                password: 'NewPassword123!',
                confirmPassword: 'NewPassword123!'
            };

            const response = await request(app)
                .post('/api/auth/reset-password')
                .send(resetData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Invalid or expired');
        });

        it('should fail with expired token', async () => {
            // Set token as expired
            user.passwordResetExpires = Date.now() - 1000; // 1 second ago
            await user.save();

            const resetData = {
                token: resetToken,
                password: 'NewPassword123!',
                confirmPassword: 'NewPassword123!'
            };

            const response = await request(app)
                .post('/api/auth/reset-password')
                .send(resetData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Invalid or expired');
        });

        it('should fail when passwords do not match', async () => {
            const resetData = {
                token: resetToken,
                password: 'NewPassword123!',
                confirmPassword: 'DifferentPassword123!'
            };

            const response = await request(app)
                .post('/api/auth/reset-password')
                .send(resetData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/auth/verify-email', () => {
        let verificationToken;
        let user;

        beforeEach(async () => {
            // Register user (assuming email verification is not automatic)
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);

            user = await User.findOne({ email: validUserData.email });
            
            // Generate verification token manually
            const crypto = require('crypto');
            verificationToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = createHash('sha256').update(verificationToken).digest('hex');
            
            user.emailVerificationToken = hashedToken;
            user.isEmailVerified = false;
            await user.save();
        });

        it('should verify email successfully with valid token', async () => {
            const response = await request(app)
                .get(`/api/auth/verify-email?token=${verificationToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('verified successfully');

            // Check that user is now verified
            const updatedUser = await User.findById(user._id);
            expect(updatedUser.isEmailVerified).toBe(true);
        });

        it('should fail with invalid token', async () => {
            const response = await request(app)
                .get('/api/auth/verify-email?token=invalid-token')
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should fail with missing token', async () => {
            const response = await request(app)
                .get('/api/auth/verify-email')
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/auth/resend-verification', () => {
        beforeEach(async () => {
            // Register and login to get tokens
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);
            
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send(loginData);
            
            accessToken = loginResponse.body.data.tokens.accessToken;

            // Set user as unverified
            await User.findOneAndUpdate(
                { email: validUserData.email },
                { isEmailVerified: false }
            );
        });

        it('should resend verification email successfully', async () => {
            const response = await request(app)
                .post('/api/auth/resend-verification')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Verification email sent successfully');
        });

        it('should fail if email already verified', async () => {
            // Set user as verified
            await User.findOneAndUpdate(
                { email: validUserData.email },
                { isEmailVerified: true }
            );

            const response = await request(app)
                .post('/api/auth/resend-verification')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('already verified');
        });

        it('should fail without authentication', async () => {
            const response = await request(app)
                .post('/api/auth/resend-verification')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });
});