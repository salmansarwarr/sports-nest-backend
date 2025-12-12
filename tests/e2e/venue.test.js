const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');
const Venue = require('../../src/models/Venue.js');

describe('Venue Routes E2E Tests', () => {
    let server;
    let ownerToken;
    let userToken;
    let venueId;

    const ownerData = {
        firstName: 'Venue',
        lastName: 'Owner',
        email: 'owner@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '+1234567890',
        dateOfBirth: '1980-01-01',
        gender: 'male',
        role: 'owner' // Note: Registration usually defaults to 'user', might need to update role manually
    };

    const userData = {
        firstName: 'Regular',
        lastName: 'User',
        email: 'user@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '+0987654321',
        dateOfBirth: '1990-01-01',
        gender: 'female'
    };

    const venueData = {
        name: 'Grand Sports Arena',
        description: 'A premier sports complex',
        address: {
            street: '123 Main St',
            city: 'Lahore',
            state: 'Punjab',
            country: 'Pakistan',
            postalCode: '54000'
        },
        location: {
            type: 'Point',
            coordinates: [74.3587, 31.5204] // [longitude, latitude]
        },
        contact: {
            primaryPhone: '+923001234567',
            email: 'arena@example.com'
        },
        amenities: {
            parking: { available: true, capacity: 100, isFree: true },
            wifi: { available: true, isFree: true },
            cafeteria: true,
            totalCourts: 5
        }
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
    });

    describe('POST /api/venues', () => {
        it('should create a venue successfully as owner', async () => {
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(venueData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe(venueData.name);
            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });
        });

        it('should create venue successfully as regular user', async () => {
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${userToken}`)
                .send(venueData)
                .expect(201);

            expect(response.body.success).toBe(true);

            // Clean up
            const newVenueId = response.body.data._id;
            await Venue.findByIdAndDelete(newVenueId);
        });

        it('should fail with missing required fields', async () => {
            const invalidData = { ...venueData };
            delete invalidData.name;

            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(invalidData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/venues', () => {
        beforeEach(async () => {
            // Create a venue to fetch
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(venueData);

            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });

            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });
        });

        it('should get all venues', async () => {
            const response = await request(app)
                .get('/api/venues')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);
        });

        it('should filter venues by city', async () => {
            const response = await request(app)
                .get('/api/venues')
                .query({ city: 'Lahore' })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data[0].address.city).toBe('Lahore');
        });
    });

    describe('GET /api/venues/:id', () => {
        beforeEach(async () => {
            // Create a venue to fetch
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(venueData);

            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });

            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });
        });

        it('should get a single venue by ID', async () => {
            const response = await request(app)
                .get(`/api/venues/${venueId}`)
                .expect(200);

            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });
        });

        it('should get a single venue by ID', async () => {
            const response = await request(app)
                .get(`/api/venues/${venueId}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data._id).toBe(venueId);
        });

        it('should return 404 for non-existent venue', async () => {
            const fakeId = new mongoose.Types.ObjectId();
            const response = await request(app)
                .get(`/api/venues/${fakeId}`)
                .expect(404);

            expect(response.body.success).toBe(false);
        });
    });

    describe('PUT /api/venues/:id', () => {
        beforeEach(async () => {
            // Create a venue to fetch
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(venueData);

            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });

            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });
        });

        it('should update venue successfully as owner', async () => {
            const updateData = { name: 'Updated Arena Name' };
            const response = await request(app)
                .put(`/api/venues/${venueId}`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe(updateData.name);
        });

        it('should fail to update venue as regular user', async () => {
            const response = await request(app)
                .put(`/api/venues/${venueId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ name: 'Hacked Name' })
                .expect(403); // Assuming ownership check or role check

            expect(response.body.success).toBe(false);
        });
    });

    describe('DELETE /api/venues/:id', () => {
        beforeEach(async () => {
            // Create a venue to fetch
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(venueData);

            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });

            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });
        });

        it('should delete venue successfully as owner', async () => {
            const response = await request(app)
                .delete(`/api/venues/${venueId}`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);

            // Verify deletion
            await request(app)
                .get(`/api/venues/${venueId}`)
                .expect(404);
        });
    });

    describe('GET /api/venues/nearby', () => {
        beforeEach(async () => {
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(venueData);

            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });
        });

        it('should find nearby venues', async () => {
            const response = await request(app)
                .get('/api/venues/nearby')
                .query({
                    latitude: 31.5204,
                    longitude: 74.3587,
                    maxDistance: 5000
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);
        });
    });
});
