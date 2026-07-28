const Stripe = require('stripe');
const Payment = require('../../src/models/Payment');
const Booking = require('../../src/models/Booking');
const Court = require('../../src/models/Court');
const Venue = require('../../src/models/Venue');
const User = require('../../src/models/User');
const {
    createPaymentIntent,
    handleWebhook,
    getPaymentHistory,
    getPayment,
    getReceipt,
} = require('../../src/controllers/paymentController');

describe('Payment Controller', () => {
    let mockReq, mockRes, mockNext;
    let user, owner, venue, court, booking;

    beforeEach(async () => {
        user = await User.create({
            firstName: 'Regular', lastName: 'User', email: 'user@example.com',
            password: 'Password123!', role: 'user'
        });
        owner = await User.create({
            firstName: 'Owner', lastName: 'User', email: 'owner@example.com',
            password: 'Password123!', role: 'owner'
        });
        venue = await Venue.create({
            name: 'Test Sports Complex',
            address: { street: '123 Main St', city: 'Karachi', state: 'Sindh', country: 'Pakistan' },
            location: { type: 'Point', coordinates: [67.0011, 24.8607] },
            contact: { primaryPhone: '+923001234567', email: 'venue@example.com' },
            amenities: { totalCourts: 5 },
            owner: owner._id
        });
        court = await Court.create({
            name: 'Test Court', venue: venue._id, sportType: 'tennis', courtType: 'outdoor',
            baseHourlyRate: 1000, owner: owner._id
        });
        booking = await Booking.create({
            user: user._id, court: court._id, venue: venue._id,
            startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
            endTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
            status: 'confirmed',
            pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100, currency: 'PKR' },
            payment: { amount: 2100, currency: 'PKR', status: 'pending' }
        });

        mockReq = { body: {}, params: {}, query: {}, user: null, headers: {} };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            setHeader: jest.fn(),
            send: jest.fn(),
        };
        mockNext = jest.fn();

        Stripe.__mockPaymentIntents.create.mockClear();
        Stripe.__mockRefunds.create.mockClear();
    });

    describe('createPaymentIntent', () => {
        it('should create a payment intent with the amount converted to minor units', async () => {
            mockReq.user = user;
            mockReq.body = { bookingId: booking._id.toString() };

            await createPaymentIntent(mockReq, mockRes, mockNext);

            expect(Stripe.__mockPaymentIntents.create).toHaveBeenCalledWith(
                expect.objectContaining({ amount: 210000, currency: 'pkr' })
            );
            expect(mockRes.status).toHaveBeenCalledWith(201);

            const payment = await Payment.findOne({ booking: booking._id });
            expect(payment.status).toBe('pending');
            expect(payment.amount).toBe(2100); // major-unit, not cents
            expect(payment.gatewayPaymentIntentId).toBe('pi_test_123');
        });

        it('should reject payment intent creation for an already-paid booking', async () => {
            booking.payment.status = 'completed';
            await booking.save();

            mockReq.user = user;
            mockReq.body = { bookingId: booking._id.toString() };

            await createPaymentIntent(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should reject payment intent creation from a non-owner', async () => {
            const stranger = await User.create({
                firstName: 'Stranger', lastName: 'Danger', email: 'stranger@example.com',
                password: 'Password123!'
            });

            mockReq.user = stranger;
            mockReq.body = { bookingId: booking._id.toString() };

            await createPaymentIntent(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('handleWebhook', () => {
        let payment;
        beforeEach(async () => {
            payment = await Payment.create({
                booking: booking._id, user: user._id, gateway: 'stripe',
                gatewayPaymentIntentId: 'pi_test_123', amount: 2100, currency: 'PKR', status: 'pending'
            });
        });

        it('should mark payment and booking as paid on payment_intent.succeeded', async () => {
            mockReq.body = JSON.stringify({
                type: 'payment_intent.succeeded',
                data: { object: { id: 'pi_test_123', latest_charge: 'ch_test_123' } }
            });
            mockReq.headers = { 'stripe-signature': 'test-sig' };

            await handleWebhook(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);

            const updatedPayment = await Payment.findById(payment._id);
            expect(updatedPayment.status).toBe('succeeded');

            const updatedBooking = await Booking.findById(booking._id);
            expect(updatedBooking.payment.status).toBe('completed');
            expect(updatedBooking.isPaid).toBe(true);
        });

        it('should mark payment as failed on payment_intent.payment_failed', async () => {
            mockReq.body = JSON.stringify({
                type: 'payment_intent.payment_failed',
                data: { object: { id: 'pi_test_123', last_payment_error: { message: 'Card declined' } } }
            });
            mockReq.headers = { 'stripe-signature': 'test-sig' };

            await handleWebhook(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);

            const updatedPayment = await Payment.findById(payment._id);
            expect(updatedPayment.status).toBe('failed');
            expect(updatedPayment.failureReason).toBe('Card declined');
        });

        it('should return 400 when signature verification fails', async () => {
            Stripe.__mockWebhooks.constructEvent.mockImplementationOnce(() => {
                throw new Error('Invalid signature');
            });

            mockReq.body = 'not-json';
            mockReq.headers = { 'stripe-signature': 'bad-sig' };

            await handleWebhook(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('getPaymentHistory / getPayment', () => {
        it("should list the current user's payment history", async () => {
            await Payment.create({
                booking: booking._id, user: user._id, gateway: 'stripe',
                amount: 2100, currency: 'PKR', status: 'succeeded'
            });

            mockReq.user = user;
            await getPaymentHistory(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 1 }));
        });

        it('should not allow another user to view a payment', async () => {
            const payment = await Payment.create({
                booking: booking._id, user: user._id, gateway: 'stripe',
                amount: 2100, currency: 'PKR', status: 'succeeded'
            });

            mockReq.user = owner;
            mockReq.params = { id: payment._id.toString() };

            await getPayment(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('getReceipt', () => {
        it('should stream a PDF for a succeeded payment', async () => {
            const payment = await Payment.create({
                booking: booking._id, user: user._id, gateway: 'stripe',
                gatewayPaymentIntentId: 'pi_test_123', amount: 2100, currency: 'PKR', status: 'succeeded', paidAt: new Date()
            });

            mockReq.user = user;
            mockReq.params = { id: payment._id.toString() };

            await getReceipt(mockReq, mockRes, mockNext);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
            expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
        });

        it('should reject a receipt request for a pending payment', async () => {
            const payment = await Payment.create({
                booking: booking._id, user: user._id, gateway: 'stripe',
                amount: 2100, currency: 'PKR', status: 'pending'
            });

            mockReq.user = user;
            mockReq.params = { id: payment._id.toString() };

            await getReceipt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });
});
