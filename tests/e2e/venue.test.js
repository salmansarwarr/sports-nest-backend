const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');
const Venue = require('../../src/models/Venue.js');

describe('Venue Routes E2E Tests', () => {
    let server;
    let adminToken;
    let ownerToken;
    let ownerId;
    let userToken;
    let venueId;

    const adminData = {
        firstName: 'Site',
        lastName: 'Admin',
        email: 'admin@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '+1111111111',
        dateOfBirth: '1975-01-01',
        gender: 'male'
    };

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

    // Venue creation is admin-only; the admin supplies the target owner's userId.
    async function createVenueAsAdmin(overrides = {}) {
        const response = await request(app)
            .post('/api/venues')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...venueData, owner: ownerId, ...overrides });

        if (response.body?.data?._id) {
            await Venue.findByIdAndUpdate(response.body.data._id, { status: 'active' });
        }
        return response;
    }

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
        // Setup Admin
        await request(app).post('/api/auth/register').send(adminData);
        await User.findOneAndUpdate(
            { email: adminData.email },
            { isEmailVerified: true, role: 'admin' }
        );
        const adminLogin = await request(app).post('/api/auth/login').send({
            email: adminData.email,
            password: adminData.password
        });
        adminToken = adminLogin.body.data.tokens.accessToken;

        // Setup Owner
        await request(app).post('/api/auth/register').send(ownerData);
        const ownerUser = await User.findOneAndUpdate(
            { email: ownerData.email },
            { isEmailVerified: true, role: 'owner' },
            { new: true }
        );
        ownerId = ownerUser._id.toString();
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
        it('should create a venue successfully as admin, assigned to an owner', async () => {
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...venueData, owner: ownerId })
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe(venueData.name);
            expect(response.body.data.owner).toBe(ownerId);
            venueId = response.body.data._id;
            await Venue.findByIdAndUpdate(venueId, { status: 'active' });
        });

        it('should not allow an owner to self-create a venue', async () => {
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(venueData)
                .expect(403);

            expect(response.body.success).toBe(false);
        });

        it('should not allow a regular user to create a venue', async () => {
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${userToken}`)
                .send(venueData)
                .expect(403);

            expect(response.body.success).toBe(false);
        });

        it('should fail with missing required fields', async () => {
            const invalidData = { ...venueData, owner: ownerId };
            delete invalidData.name;

            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should fail without an owner in the body', async () => {
            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(venueData)
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should reject a second venue for an owner who already has one', async () => {
            await createVenueAsAdmin();

            const response = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...venueData, owner: ownerId })
                .expect(409);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/venues', () => {
        beforeEach(async () => {
            const response = await createVenueAsAdmin();
            venueId = response.body.data._id;
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
            const response = await createVenueAsAdmin();
            venueId = response.body.data._id;
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
            const response = await createVenueAsAdmin();
            venueId = response.body.data._id;
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
            const response = await createVenueAsAdmin();
            venueId = response.body.data._id;
        });

        it('should delete venue successfully as admin', async () => {
            const response = await request(app)
                .delete(`/api/venues/${venueId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);

            // Verify deletion
            await request(app)
                .get(`/api/venues/${venueId}`)
                .expect(404);
        });

        it('should not allow the owner to delete their own venue', async () => {
            const response = await request(app)
                .delete(`/api/venues/${venueId}`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/venues/nearby', () => {
        beforeAll(async () => {
            // Ensure the 2dsphere index required by $geoNear actually exists
            // before this describe block's tests run — mongoose builds
            // indexes in the background after connecting, and the native
            // driver call here is a safe way to wait for it without
            // triggering mongoose's Model.init()/createCollection path
            // (which errors in this test harness's connection setup).
            await mongoose.connection.db
                .collection('venues')
                .createIndex({ location: '2dsphere' });
        });

        beforeEach(async () => {
            await createVenueAsAdmin();
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
