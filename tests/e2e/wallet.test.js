const request = require('supertest');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');

describe('Wallet Routes E2E Tests', () => {
    let userToken, userId, adminToken;

    const userData = {
        firstName: 'Wallet', lastName: 'Holder', email: 'wallet@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+0987654321', dateOfBirth: '1995-01-01', gender: 'female'
    };

    const adminData = {
        firstName: 'Wallet', lastName: 'Admin', email: 'walletadmin@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+1234567890', dateOfBirth: '1985-01-01', gender: 'male'
    };

    beforeEach(async () => {
        await request(app).post('/api/auth/register').send(userData);
        await User.findOneAndUpdate({ email: userData.email }, { isEmailVerified: true });
        const userLogin = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
        userToken = userLogin.body.data.tokens.accessToken;
        userId = userLogin.body.data.user._id;

        await request(app).post('/api/auth/register').send(adminData);
        await User.findOneAndUpdate({ email: adminData.email }, { isEmailVerified: true, role: 'admin' });
        const adminLogin = await request(app).post('/api/auth/login').send({ email: adminData.email, password: adminData.password });
        adminToken = adminLogin.body.data.tokens.accessToken;
    });

    describe('GET /api/wallet', () => {
        it("should return the current user's wallet balance", async () => {
            const response = await request(app)
                .get('/api/wallet')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.walletBalance).toBe(0);
        });

        it('should require authentication', async () => {
            const response = await request(app).get('/api/wallet');
            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/wallet/admin/:userId/adjust', () => {
        it('should let an admin credit a user wallet', async () => {
            const response = await request(app)
                .post(`/api/wallet/admin/${userId}/adjust`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ amount: 1000, type: 'credit', reason: 'goodwill credit' });

            expect(response.status).toBe(200);
            expect(response.body.data.walletBalance).toBe(1000);

            const balanceResponse = await request(app)
                .get('/api/wallet')
                .set('Authorization', `Bearer ${userToken}`);
            expect(balanceResponse.body.data.walletBalance).toBe(1000);
        });

        it('should reject a non-admin attempting to adjust a wallet', async () => {
            const response = await request(app)
                .post(`/api/wallet/admin/${userId}/adjust`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ amount: 1000, type: 'credit', reason: 'self credit attempt' });

            expect(response.status).toBe(403);
        });
    });

    describe('GET /api/wallet/transactions', () => {
        it('should list ledger entries after an admin credit', async () => {
            await request(app)
                .post(`/api/wallet/admin/${userId}/adjust`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ amount: 500, type: 'credit', reason: 'test credit' });

            const response = await request(app)
                .get('/api/wallet/transactions')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(200);
            expect(response.body.count).toBe(1);
            expect(response.body.data[0].amount).toBe(500);
            expect(response.body.data[0].source).toBe('admin_adjustment');
        });
    });

    describe('POST /api/wallet/top-up', () => {
        it('should create a Stripe payment intent for a wallet top-up', async () => {
            const response = await request(app)
                .post('/api/wallet/top-up')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ amount: 500 });

            expect(response.status).toBe(201);
            expect(response.body.data.clientSecret).toBeDefined();
        });

        it('should reject a non-positive top-up amount', async () => {
            const response = await request(app)
                .post('/api/wallet/top-up')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ amount: 0 });

            expect(response.status).toBe(400);
        });
    });

    describe('Booking with wallet payment', () => {
        const ownerData = {
            firstName: 'Wallet', lastName: 'Owner', email: 'walletowner@example.com',
            password: 'Password123!', confirmPassword: 'Password123!',
            phone: '+1112223333', dateOfBirth: '1985-01-01', gender: 'male', role: 'owner'
        };

        it('should cover a booking entirely from wallet balance with no payment intent required', async () => {
            await request(app).post('/api/auth/register').send(ownerData);
            await User.findOneAndUpdate({ email: ownerData.email }, { isEmailVerified: true, role: 'owner' });
            const ownerLogin = await request(app).post('/api/auth/login').send({ email: ownerData.email, password: ownerData.password });
            const ownerToken = ownerLogin.body.data.tokens.accessToken;

            const venueResponse = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({
                    name: 'Wallet Test Complex',
                    address: { street: '1 Wallet St', city: 'Karachi', state: 'Sindh', country: 'Pakistan', postalCode: '75000' },
                    location: { type: 'Point', coordinates: [67.0011, 24.8607] },
                    contact: { primaryPhone: '+923001112222', email: 'walletvenue@example.com' },
                    amenities: { totalCourts: 5 }
                });
            const venueId = venueResponse.body.data._id;

            const courtResponse = await request(app)
                .post('/api/courts')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({
                    name: 'Wallet Test Court', sportType: 'tennis', courtType: 'outdoor',
                    baseHourlyRate: 1000, currency: 'PKR', venue: venueId,
                    operatingHours: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, openTime: '00:00', closeTime: '23:59' }))
                });
            const courtId = courtResponse.body.data._id;

            await request(app)
                .post(`/api/wallet/admin/${userId}/adjust`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ amount: 5000, type: 'credit', reason: 'test funding' });

            const startTime = new Date();
            startTime.setDate(startTime.getDate() + 1);
            startTime.setHours(10, 0, 0, 0);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            const bookingResponse = await request(app)
                .post('/api/bookings')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ court: courtId, startTime: startTime.toISOString(), endTime: endTime.toISOString(), useWallet: true });

            expect(bookingResponse.status).toBe(201);
            expect(bookingResponse.body.data.isPaid).toBe(true);
            expect(bookingResponse.body.data.payment.method).toBe('wallet');

            const balanceResponse = await request(app)
                .get('/api/wallet')
                .set('Authorization', `Bearer ${userToken}`);
            expect(balanceResponse.body.data.walletBalance).toBe(5000 - bookingResponse.body.data.pricing.totalAmount);

            const intentResponse = await request(app)
                .post('/api/payments/create-intent')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ bookingId: bookingResponse.body.data._id });

            expect(intentResponse.status).toBe(400);
            expect(intentResponse.body.message).toBe('Booking is already paid');
        });
    });
});
