const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');
const Booking = require('../../src/models/Booking.js');

describe('Payment Routes E2E Tests', () => {
    let ownerToken, userToken, venueId, courtId, bookingId;

    const ownerData = {
        firstName: 'Payment', lastName: 'Owner', email: 'paymentowner@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+1234567890', dateOfBirth: '1985-01-01', gender: 'male', role: 'owner'
    };

    const userData = {
        firstName: 'Payment', lastName: 'Payer', email: 'paymentpayer@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+0987654321', dateOfBirth: '1995-01-01', gender: 'female'
    };

    const venueData = {
        name: 'Payment Test Complex',
        address: { street: '789 Pay St', city: 'Karachi', state: 'Sindh', country: 'Pakistan', postalCode: '75000' },
        location: { type: 'Point', coordinates: [67.0011, 24.8607] },
        contact: { primaryPhone: '+923007654321', email: 'paycomplex@example.com' },
        amenities: { totalCourts: 5 }
    };

    const courtData = {
        name: 'Payment Test Court',
        sportType: 'tennis',
        courtType: 'outdoor',
        baseHourlyRate: 1000,
        currency: 'PKR',
        operatingHours: Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i, openTime: '00:00', closeTime: '23:59'
        }))
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

        const venueResponse = await request(app)
            .post('/api/venues')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(venueData);
        venueId = venueResponse.body.data._id;

        const courtResponse = await request(app)
            .post('/api/courts')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ ...courtData, venue: venueId });
        courtId = courtResponse.body.data._id;

        const startTime = new Date();
        startTime.setDate(startTime.getDate() + 1);
        startTime.setHours(10, 0, 0, 0);
        const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

        const bookingResponse = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ court: courtId, startTime: startTime.toISOString(), endTime: endTime.toISOString() });
        bookingId = bookingResponse.body.data._id;
    });

    describe('POST /api/payments/create-intent', () => {
        it('should create a payment intent for the booking owner', async () => {
            const response = await request(app)
                .post('/api/payments/create-intent')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ bookingId });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.clientSecret).toBeDefined();
        });

        it('should reject payment intent creation from an unrelated user', async () => {
            await request(app).post('/api/auth/register').send({
                firstName: 'Other', lastName: 'User', email: 'otherpayer@example.com',
                password: 'Password123!', confirmPassword: 'Password123!',
                phone: '+1122334455', dateOfBirth: '1990-01-01', gender: 'male'
            });
            await User.findOneAndUpdate({ email: 'otherpayer@example.com' }, { isEmailVerified: true });
            const otherLogin = await request(app).post('/api/auth/login').send({ email: 'otherpayer@example.com', password: 'Password123!' });

            const response = await request(app)
                .post('/api/payments/create-intent')
                .set('Authorization', `Bearer ${otherLogin.body.data.tokens.accessToken}`)
                .send({ bookingId });

            expect(response.status).toBe(403);
        });
    });

    describe('POST /api/payments/webhook', () => {
        it('should process the raw webhook body and mark the booking as paid', async () => {
            const intentResponse = await request(app)
                .post('/api/payments/create-intent')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ bookingId });

            const paymentId = intentResponse.body.data.paymentId;

            const event = {
                type: 'payment_intent.succeeded',
                data: { object: { id: 'pi_test_123', latest_charge: 'ch_test_123' } }
            };

            const response = await request(app)
                .post('/api/payments/webhook')
                .set('Content-Type', 'application/json')
                .set('stripe-signature', 'test-signature')
                .send(JSON.stringify(event));

            expect(response.status).toBe(200);

            const updatedBooking = await Booking.findById(bookingId);
            expect(updatedBooking.payment.status).toBe('completed');
            expect(updatedBooking.isPaid).toBe(true);

            const receiptResponse = await request(app)
                .get(`/api/payments/${paymentId}/receipt`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(receiptResponse.status).toBe(200);
            expect(receiptResponse.headers['content-type']).toBe('application/pdf');
            expect(receiptResponse.body.length).toBeGreaterThan(0);
        });
    });
});
