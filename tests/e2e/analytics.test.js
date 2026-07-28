const request = require('supertest');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');

describe('Analytics Routes E2E Tests', () => {
    let ownerToken, userToken, adminToken, venueId, courtId;

    const ownerData = {
        firstName: 'Analytics', lastName: 'Owner', email: 'analyticsowner@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+1234567890', dateOfBirth: '1985-01-01', gender: 'male', role: 'owner'
    };

    const userData = {
        firstName: 'Analytics', lastName: 'User', email: 'analyticsuser2@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+0987654321', dateOfBirth: '1995-01-01', gender: 'female'
    };

    const adminData = {
        firstName: 'Analytics', lastName: 'Admin', email: 'analyticsadmin2@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+1122334455', dateOfBirth: '1980-01-01', gender: 'male'
    };

    const venueData = {
        name: 'Analytics Test Complex',
        address: { street: '10 Analytics St', city: 'Karachi', state: 'Sindh', country: 'Pakistan', postalCode: '75000' },
        location: { type: 'Point', coordinates: [67.0011, 24.8607] },
        contact: { primaryPhone: '+923009876543', email: 'analyticscomplex@example.com' },
        amenities: { totalCourts: 1 }
    };

    const courtData = {
        name: 'Analytics Test Court',
        sportType: 'tennis',
        courtType: 'outdoor',
        baseHourlyRate: 1000,
        currency: 'PKR',
        operatingHours: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, openTime: '00:00', closeTime: '23:59' }))
    };

    beforeEach(async () => {
        await request(app).post('/api/auth/register').send(ownerData);
        await User.findOneAndUpdate({ email: ownerData.email }, { isEmailVerified: true, role: 'owner' });
        const ownerLogin = await request(app).post('/api/auth/login').send({ email: ownerData.email, password: ownerData.password });
        ownerToken = ownerLogin.body.data.tokens.accessToken;

        await request(app).post('/api/auth/register').send(userData);
        await User.findOneAndUpdate({ email: userData.email }, { isEmailVerified: true });
        const userLogin = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
        userToken = userLogin.body.data.tokens.accessToken;

        await request(app).post('/api/auth/register').send(adminData);
        await User.findOneAndUpdate({ email: adminData.email }, { isEmailVerified: true, role: 'admin' });
        const adminLogin = await request(app).post('/api/auth/login').send({ email: adminData.email, password: adminData.password });
        adminToken = adminLogin.body.data.tokens.accessToken;

        const venueResponse = await request(app).post('/api/venues').set('Authorization', `Bearer ${ownerToken}`).send(venueData);
        venueId = venueResponse.body.data._id;

        const courtResponse = await request(app).post('/api/courts').set('Authorization', `Bearer ${ownerToken}`).send({ ...courtData, venue: venueId });
        courtId = courtResponse.body.data._id;
    });

    describe('Role gating', () => {
        it('should reject a regular user with 403', async () => {
            const response = await request(app)
                .get('/api/analytics/revenue')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(403);
        });

        it('should allow an owner', async () => {
            const response = await request(app)
                .get('/api/analytics/revenue')
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        it('should allow an admin', async () => {
            const response = await request(app)
                .get('/api/analytics/popular-courts')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
        });
    });

    describe('GET /api/analytics/occupancy', () => {
        it('should require startDate and endDate', async () => {
            const response = await request(app)
                .get('/api/analytics/occupancy')
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.status).toBe(400);
        });

        it('should return occupancy data for a valid date range', async () => {
            const start = new Date();
            const end = new Date();
            end.setDate(end.getDate() + 7);

            const response = await request(app)
                .get('/api/analytics/occupancy')
                .query({ startDate: start.toISOString(), endDate: end.toISOString() })
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });
    });

    describe('GET /api/analytics/bookings-summary', () => {
        it('should return a summary for the owner', async () => {
            const response = await request(app)
                .get('/api/analytics/bookings-summary')
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('statusBreakdown');
            expect(response.body.data).toHaveProperty('trend');
        });
    });
});
