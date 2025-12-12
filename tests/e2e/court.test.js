const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');
const Venue = require('../../src/models/Venue.js');
const Court = require('../../src/models/Court.js');

describe('Court Routes E2E Tests', () => {
    let server;
    let ownerToken;
    let userToken;
    let venueId;
    let courtId;

    const ownerData = {
        firstName: 'Court',
        lastName: 'Owner',
        email: 'courtowner@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '+1234567890',
        dateOfBirth: '1985-01-01',
        gender: 'male',
        role: 'owner'
    };

    const userData = {
        firstName: 'Court',
        lastName: 'Player',
        email: 'player@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '+0987654321',
        dateOfBirth: '1995-01-01',
        gender: 'female'
    };

    const venueData = {
        name: 'Court Complex',
        description: 'Venue for courts',
        address: {
            street: '456 Court St',
            city: 'Karachi',
            state: 'Sindh',
            country: 'Pakistan',
            postalCode: '75000'
        },
        location: {
            type: 'Point',
            coordinates: [67.0011, 24.8607]
        },
        contact: {
            primaryPhone: '+923007654321',
            email: 'complex@example.com'
        },
        amenities: {
            parking: { available: true, capacity: 100, isFree: true },
            wifi: { available: true, isFree: true },
            cafeteria: true,
            totalCourts: 5
        }
    };

    const courtData = {
        name: 'Center Court',
        courtNumber: '1',
        description: 'Main tennis court',
        sportType: 'tennis',
        surfaceType: 'clay',
        courtType: 'outdoor',
        baseHourlyRate: 1500,
        currency: 'PKR',
        operatingHours: Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i,
            openTime: '06:00',
            closeTime: '23:00'
        }))
    };

    beforeAll(async () => {
        server = app.listen(0);
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.TEST_DATABASE_URL);
        }
    });

    afterAll(async () => {
        await mongoose.connection.close();
        if (server) {
            server.close();
        }
    });

    beforeEach(async () => {
        // Setup Owner
        await request(app).post('/api/auth/register').send(ownerData);
        await User.findOneAndUpdate(
            { email: ownerData.email },
            { isEmailVerified: true, role: 'owner' }
        );
        const ownerLogin = await request(app).post('/api/auth/login').send({
            email: ownerData.email,
            password: ownerData.password
        });
        ownerToken = ownerLogin.body.data.tokens.accessToken;

        // Setup Regular User
        await request(app).post('/api/auth/register').send(userData);
        await User.findOneAndUpdate(
            { email: userData.email },
            { isEmailVerified: true }
        );
        const userLogin = await request(app).post('/api/auth/login').send({
            email: userData.email,
            password: userData.password
        });
        userToken = userLogin.body.data.tokens.accessToken;

        // Create Venue
        const venueResponse = await request(app)
            .post('/api/venues')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(venueData);

        venueId = venueResponse.body.data._id;
    });

    describe('POST /api/courts', () => {
        it('should create a court successfully as owner', async () => {
            const newCourtData = { ...courtData, venue: venueId };
            const response = await request(app)
                .post('/api/courts')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(newCourtData);

            expect(response.status).toBe(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe(courtData.name);
            courtId = response.body.data._id;
        });

        it('should fail to create court without venue', async () => {
            const invalidData = { ...courtData }; // Missing venue
            const response = await request(app)
                .post('/api/courts')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(invalidData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/courts', () => {
        beforeEach(async () => {
            const newCourtData = { ...courtData, venue: venueId };
            const response = await request(app)
                .post('/api/courts')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(newCourtData);
            courtId = response.body.data._id;
        });

        it('should get all courts', async () => {
            const response = await request(app)
                .get('/api/courts')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);
        });

        it('should filter courts by sport type', async () => {
            const response = await request(app)
                .get('/api/courts')
                .query({ sportType: 'tennis' })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data[0].sportType).toBe('tennis');
        });
    });

    describe('GET /api/courts/:id', () => {
        beforeEach(async () => {
            const newCourtData = { ...courtData, venue: venueId };
            const response = await request(app)
                .post('/api/courts')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(newCourtData);
            courtId = response.body.data._id;
        });

        it('should get a single court by ID', async () => {
            const response = await request(app)
                .get(`/api/courts/${courtId}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data._id).toBe(courtId);
        });
    });

    describe('PUT /api/courts/:id', () => {
        beforeEach(async () => {
            const newCourtData = { ...courtData, venue: venueId };
            const response = await request(app)
                .post('/api/courts')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(newCourtData);
            courtId = response.body.data._id;
        });

        it('should update court successfully as owner', async () => {
            const updateData = { name: 'Updated Court Name' };
            const response = await request(app)
                .put(`/api/courts/${courtId}`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe(updateData.name);
        });
    });

    describe('DELETE /api/courts/:id', () => {
        beforeEach(async () => {
            const newCourtData = { ...courtData, venue: venueId };
            const response = await request(app)
                .post('/api/courts')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(newCourtData);
            courtId = response.body.data._id;
        });

        it('should delete court successfully as owner', async () => {
            const response = await request(app)
                .delete(`/api/courts/${courtId}`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);

            await request(app)
                .get(`/api/courts/${courtId}`)
                .expect(404);
        });
    });

    describe('POST /api/courts/:id/check-availability', () => {
        beforeEach(async () => {
            const newCourtData = { ...courtData, venue: venueId };
            const response = await request(app)
                .post('/api/courts')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(newCourtData);
            courtId = response.body.data._id;
        });

        it('should check availability', async () => {
            const startTime = new Date();
            startTime.setDate(startTime.getDate() + 1);
            startTime.setHours(10, 0, 0, 0);

            const endTime = new Date(startTime);
            endTime.setHours(11, 0, 0, 0);

            const response = await request(app)
                .post(`/api/courts/${courtId}/check-availability`)
                .send({
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString()
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('available');
        });
    });

    describe('POST /api/courts/:id/calculate-price', () => {
        beforeEach(async () => {
            const newCourtData = { ...courtData, venue: venueId };
            const response = await request(app)
                .post('/api/courts')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(newCourtData);
            courtId = response.body.data._id;
        });

        it('should calculate price', async () => {
            const startTime = new Date();
            startTime.setDate(startTime.getDate() + 1);
            startTime.setHours(10, 0, 0, 0);

            const endTime = new Date(startTime);
            endTime.setHours(12, 0, 0, 0); // 2 hours

            const response = await request(app)
                .post(`/api/courts/${courtId}/calculate-price`)
                .send({
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString()
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('totalPrice');
            // Base rate is 1500, so 2 hours should be around 3000
            expect(response.body.data.totalPrice).toBeGreaterThan(0);
        });
    });
});
