const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');

describe('Authentication Routes E2E Tests', () => {
    let server;
    let accessToken;
    let refreshToken;

    // Test data
    const validUserData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john70@gmail.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '+1234567890',
        dateOfBirth: '1990-01-01',
        gender: "male"
    };

    const loginData = {
        email: 'john70@gmail.com',
        password: 'Password123!'
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
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);

            await User.findOneAndUpdate({ email: validUserData.email }, { isEmailVerified: true });
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
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);

            await User.findOneAndUpdate({ email: validUserData.email }, { isEmailVerified: true });

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
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);

            await User.findOneAndUpdate({ email: validUserData.email }, { isEmailVerified: true });

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
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);

            await User.findOneAndUpdate({ email: validUserData.email }, { isEmailVerified: true });

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
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);

            await User.findOneAndUpdate({ email: validUserData.email }, { isEmailVerified: true });

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
            await request(app)
                .post('/api/auth/register')
                .send(validUserData);

            await User.findOneAndUpdate({ email: validUserData.email }, { isEmailVerified: true });

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
});