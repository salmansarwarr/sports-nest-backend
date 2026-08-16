const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');
const Booking = require('../../src/models/Booking.js');
const Stripe = require('stripe');

describe('Payment Routes E2E Tests', () => {
    let ownerToken, userToken, adminToken, venueId, courtId, bookingId;

    const ownerData = {
        firstName: 'Payment', lastName: 'Owner', email: 'paymentowner@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+1234567890', dateOfBirth: '1985-01-01', gender: 'male', role: 'owner'
    };

    const adminData = {
        firstName: 'Payment', lastName: 'Admin', email: 'paymentadmin@example.com',
        password: 'Password123!', confirmPassword: 'Password123!',
        phone: '+1122334455', dateOfBirth: '1980-01-01', gender: 'male'
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
        amenities: { totalCourts: 5 },
        documents: [{ type: 'business-license', url: 'https://example.com/license.pdf' }]
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
        const ownerUser = await User.findOneAndUpdate(
            { email: ownerData.email },
            { isEmailVerified: true, role: 'owner' },
            { new: true }
        );
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

        const venueResponse = await request(app)
            .post('/api/venues')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...venueData, owner: ownerUser._id.toString() });
        venueId = venueResponse.body.data._id;
        await require('../../src/models/Venue.js').findByIdAndUpdate(venueId, { status: 'active' });

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

        it('should map a Stripe SDK authentication error to 502, never 401 (a real 401 here would make the frontend wrongly log the user out)', async () => {
            Stripe.__mockPaymentIntents.create.mockRejectedValueOnce({
                type: 'StripeAuthenticationError',
                statusCode: 401,
                message: 'Invalid API Key provided'
            });

            const response = await request(app)
                .post('/api/payments/create-intent')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ bookingId });

            expect(response.status).toBe(502);
            expect(response.status).not.toBe(401);
            expect(response.body.success).toBe(false);
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

    describe('POST /api/payments/:bookingId/mark-paid-test', () => {
        it('should mark the booking as paid for its owner without a real payment', async () => {
            const response = await request(app)
                .post(`/api/payments/${bookingId}/mark-paid-test`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.isPaid).toBe(true);
            expect(response.body.data.payment.status).toBe('completed');

            const updatedBooking = await Booking.findById(bookingId);
            expect(updatedBooking.isPaid).toBe(true);
            expect(updatedBooking.payment.status).toBe('completed');

            const Payment = require('../../src/models/Payment.js');
            const paymentRecord = await Payment.findOne({ booking: bookingId });
            expect(paymentRecord).not.toBeNull();
            expect(paymentRecord.status).toBe('succeeded');
        });

        it('should allow an admin to mark someone else\'s booking as paid', async () => {
            const response = await request(app)
                .post(`/api/payments/${bookingId}/mark-paid-test`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        it('should reject an unrelated user marking someone else\'s booking as paid', async () => {
            const response = await request(app)
                .post(`/api/payments/${bookingId}/mark-paid-test`)
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.status).toBe(403);
        });

        it('should reject marking an already-paid booking as paid again', async () => {
            await request(app)
                .post(`/api/payments/${bookingId}/mark-paid-test`)
                .set('Authorization', `Bearer ${userToken}`);

            const response = await request(app)
                .post(`/api/payments/${bookingId}/mark-paid-test`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(400);
        });

        it('should be disabled in production', async () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const response = await request(app)
                .post(`/api/payments/${bookingId}/mark-paid-test`)
                .set('Authorization', `Bearer ${userToken}`);

            process.env.NODE_ENV = originalEnv;

            expect(response.status).toBe(403);
        });
    });
});
