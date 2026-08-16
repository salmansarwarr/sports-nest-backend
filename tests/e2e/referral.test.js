const request = require('supertest');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');
const { REFERRER_REWARD, REFERRED_REWARD } = require('../../src/config/referralRewards');

describe('Referral Routes E2E Tests', () => {
    let referrerToken, referredToken, referredId, ownerToken, ownerId, adminToken;

    const referrerData = {
        firstName: 'Referrer', lastName: 'User', email: 'referrer@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+1234567890', dateOfBirth: '1985-01-01', gender: 'male'
    };

    const referredData = {
        firstName: 'Referred', lastName: 'User', email: 'referred@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+0987654321', dateOfBirth: '1995-01-01', gender: 'female'
    };

    const ownerData = {
        firstName: 'Referral', lastName: 'Owner', email: 'referralowner@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+1112223333', dateOfBirth: '1985-01-01', gender: 'male', role: 'owner'
    };

    const adminData = {
        firstName: 'Referral', lastName: 'Admin', email: 'referraladmin@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+2223334444', dateOfBirth: '1985-01-01', gender: 'male'
    };

    beforeEach(async () => {
        await request(app).post('/api/auth/register').send(referrerData);
        await User.findOneAndUpdate({ email: referrerData.email }, { isEmailVerified: true });
        const referrerLogin = await request(app).post('/api/auth/login').send({ email: referrerData.email, password: referrerData.password });
        referrerToken = referrerLogin.body.data.tokens.accessToken;

        await request(app).post('/api/auth/register').send(ownerData);
        const ownerUser = await User.findOneAndUpdate(
            { email: ownerData.email },
            { isEmailVerified: true, role: 'owner' },
            { new: true }
        );
        ownerId = ownerUser._id.toString();
        const ownerLogin = await request(app).post('/api/auth/login').send({ email: ownerData.email, password: ownerData.password });
        ownerToken = ownerLogin.body.data.tokens.accessToken;

        await request(app).post('/api/auth/register').send(adminData);
        await User.findOneAndUpdate({ email: adminData.email }, { isEmailVerified: true, role: 'admin' });
        const adminLogin = await request(app).post('/api/auth/login').send({ email: adminData.email, password: adminData.password });
        adminToken = adminLogin.body.data.tokens.accessToken;
    });

    describe('GET /api/referrals/my-code', () => {
        it('should return a generated referral code', async () => {
            const response = await request(app)
                .get('/api/referrals/my-code')
                .set('Authorization', `Bearer ${referrerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.referralCode).toEqual(expect.any(String));
        });
    });

    describe('Full referral loop', () => {
        it('should credit both wallets once the referred user completes their first wallet-paid booking', async () => {
            const codeResponse = await request(app)
                .get('/api/referrals/my-code')
                .set('Authorization', `Bearer ${referrerToken}`);
            const referralCode = codeResponse.body.data.referralCode;

            const registerResponse = await request(app)
                .post('/api/auth/register')
                .send({ ...referredData, referralCode });
            expect(registerResponse.status).toBe(201);

            await User.findOneAndUpdate({ email: referredData.email }, { isEmailVerified: true });
            const referredLogin = await request(app).post('/api/auth/login').send({ email: referredData.email, password: referredData.password });
            referredToken = referredLogin.body.data.tokens.accessToken;
            referredId = referredLogin.body.data.user._id;

            const venueResponse = await request(app)
                .post('/api/venues')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Referral Test Complex',
                    owner: ownerId,
                    address: { street: '1 Referral St', city: 'Karachi', state: 'Sindh', country: 'Pakistan', postalCode: '75000' },
                    location: { type: 'Point', coordinates: [67.0011, 24.8607] },
                    contact: { primaryPhone: '+923001112222', email: 'referralvenue@example.com' },
                    amenities: { totalCourts: 5 },
                    documents: [{ type: 'business-license', url: 'https://example.com/license.pdf' }]
                });
            const venueId = venueResponse.body.data._id;
            await require('../../src/models/Venue.js').findByIdAndUpdate(venueId, { status: 'active' });

            const courtResponse = await request(app)
                .post('/api/courts')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({
                    name: 'Referral Test Court', sportType: 'tennis', courtType: 'outdoor',
                    baseHourlyRate: 1000, currency: 'PKR', venue: venueId,
                    operatingHours: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, openTime: '00:00', closeTime: '23:59' }))
                });
            const courtId = courtResponse.body.data._id;

            await request(app)
                .post(`/api/wallet/admin/${referredId}/adjust`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ amount: 5000, type: 'credit', reason: 'test funding' });

            const startTime = new Date();
            startTime.setDate(startTime.getDate() + 1);
            startTime.setHours(10, 0, 0, 0);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            const bookingResponse = await request(app)
                .post('/api/bookings')
                .set('Authorization', `Bearer ${referredToken}`)
                .send({ court: courtId, startTime: startTime.toISOString(), endTime: endTime.toISOString(), useWallet: true });

            expect(bookingResponse.status).toBe(201);
            expect(bookingResponse.body.data.isPaid).toBe(true);

            const referrerWallet = await request(app)
                .get('/api/wallet')
                .set('Authorization', `Bearer ${referrerToken}`);
            expect(referrerWallet.body.data.walletBalance).toBe(REFERRER_REWARD);

            const referredWallet = await request(app)
                .get('/api/wallet')
                .set('Authorization', `Bearer ${referredToken}`);
            expect(referredWallet.body.data.walletBalance).toBe(5000 - bookingResponse.body.data.pricing.totalAmount + REFERRED_REWARD);

            const referralsResponse = await request(app)
                .get('/api/referrals')
                .set('Authorization', `Bearer ${referrerToken}`);
            expect(referralsResponse.status).toBe(200);
            expect(referralsResponse.body.count).toBe(1);
            expect(referralsResponse.body.data[0].status).toBe('rewarded');
        });
    });
});
