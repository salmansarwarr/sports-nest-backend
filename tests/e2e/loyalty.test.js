const request = require('supertest');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');
const { POINTS_TO_WALLET_RATE } = require('../../src/config/loyaltyRates');

describe('Loyalty Routes E2E Tests', () => {
    let userToken, userId;

    const userData = {
        firstName: 'Loyalty', lastName: 'Member', email: 'loyalty@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+0987654321', dateOfBirth: '1995-01-01', gender: 'female'
    };

    beforeEach(async () => {
        await request(app).post('/api/auth/register').send(userData);
        await User.findOneAndUpdate({ email: userData.email }, { isEmailVerified: true });
        const userLogin = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
        userToken = userLogin.body.data.tokens.accessToken;
        userId = userLogin.body.data.user._id;
    });

    describe('GET /api/loyalty', () => {
        it("should return the current user's loyalty points balance", async () => {
            const response = await request(app)
                .get('/api/loyalty')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.loyaltyPoints).toBe(0);
        });

        it('should require authentication', async () => {
            const response = await request(app).get('/api/loyalty');
            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/loyalty/redeem', () => {
        it('should redeem points into wallet credit', async () => {
            await User.earnLoyaltyPoints(userId, 200, { source: 'booking_completed' });

            const response = await request(app)
                .post('/api/loyalty/redeem')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ points: 150 });

            expect(response.status).toBe(200);
            expect(response.body.data.loyaltyPoints).toBe(50);
            expect(response.body.data.walletBalance).toBe(150 * POINTS_TO_WALLET_RATE);

            const walletResponse = await request(app)
                .get('/api/wallet')
                .set('Authorization', `Bearer ${userToken}`);
            expect(walletResponse.body.data.walletBalance).toBe(150 * POINTS_TO_WALLET_RATE);
        });

        it('should reject redeeming more points than the current balance', async () => {
            const response = await request(app)
                .post('/api/loyalty/redeem')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ points: 500 });

            expect(response.status).toBe(400);
        });

        it('should reject a non-positive points value', async () => {
            const response = await request(app)
                .post('/api/loyalty/redeem')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ points: 0 });

            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/loyalty/transactions', () => {
        it('should list ledger entries after a redemption', async () => {
            await User.earnLoyaltyPoints(userId, 100, { source: 'booking_completed' });

            await request(app)
                .post('/api/loyalty/redeem')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ points: 40 });

            const response = await request(app)
                .get('/api/loyalty/transactions')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(200);
            expect(response.body.count).toBe(2);
        });
    });
});
