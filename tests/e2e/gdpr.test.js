const request = require('supertest');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');

describe('GDPR Routes E2E Tests', () => {
    const userData = {
        firstName: 'Gdpr', lastName: 'User', email: 'gdprflow@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+1234567890', dateOfBirth: '1990-01-01', gender: 'male'
    };

    let token;

    beforeEach(async () => {
        await request(app).post('/api/auth/register').send(userData);
        await User.findOneAndUpdate({ email: userData.email }, { isEmailVerified: true });
        const login = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
        token = login.body.data.tokens.accessToken;
    });

    describe('GET /api/auth/data-export', () => {
        it('should return the expected top-level keys', async () => {
            const response = await request(app)
                .get('/api/auth/data-export')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('profile');
            expect(response.body.data).toHaveProperty('bookings');
            expect(response.body.data).toHaveProperty('payments');
            expect(response.body.data).toHaveProperty('reviews');
            expect(response.body.data).toHaveProperty('favorites');
            expect(response.body.data).toHaveProperty('supportTickets');
            expect(response.body.data.profile.email).toBe(userData.email);
        });
    });

    describe('DELETE /api/auth/account', () => {
        it('should reject deletion with the wrong password', async () => {
            const response = await request(app)
                .delete('/api/auth/account')
                .set('Authorization', `Bearer ${token}`)
                .send({ password: 'WrongPassword123!' });

            expect(response.status).toBe(400);
        });

        it('should delete the account and prevent future login with the old credentials', async () => {
            const deleteResponse = await request(app)
                .delete('/api/auth/account')
                .set('Authorization', `Bearer ${token}`)
                .send({ password: userData.password });

            expect(deleteResponse.status).toBe(200);
            expect(deleteResponse.body.success).toBe(true);

            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({ email: userData.email, password: userData.password });

            expect(loginResponse.status).toBe(401);
        });
    });
});
