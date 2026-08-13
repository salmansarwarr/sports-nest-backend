const Stripe = require('stripe');
const Booking = require('../../src/models/Booking');
const Court = require('../../src/models/Court');
const Venue = require('../../src/models/Venue');
const User = require('../../src/models/User');
const PromoCode = require('../../src/models/PromoCode');
const Payment = require('../../src/models/Payment');
const AuditLog = require('../../src/models/AuditLog');
const WalletTransaction = require('../../src/models/WalletTransaction');
const {
    createBooking,
    getBookings,
    getBooking,
    updateBooking,
    cancelBooking,
    checkAvailability,
    getAvailableSlots,
    approveBooking,
    rejectBooking,
    checkIn,
    checkOut,
    getMyBookings,
    inviteParticipant,
    respondToParticipant,
    removeParticipant
} = require('../../src/controllers/bookingController');

// Returns a Date `daysFromNow` days ahead, fixed at `hour`:00 local time. The test
// court's operating hours are 08:00-20:00 every day; using a fixed mid-day hour
// (rather than Date.now() + N*60*60*1000, which preserves the current hour-of-day)
// keeps availability-dependent tests deterministic regardless of when they're run.
const getSlotTime = (daysFromNow, hour = 10) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    date.setHours(hour, 0, 0, 0);
    return date;
};

describe('Booking Model', () => {
    let venue, court, user;

    beforeEach(async () => {
        // Create test user
        user = await User.create({
            firstName: 'John',
            lastName: 'Doe',
            email: 'user@example.com',
            password: 'Password123!',
            role: 'user'
        });

        // Create test venue
        venue = await Venue.create({
            name: 'Test Sports Complex',
            address: {
                street: '123 Main St',
                city: 'Karachi',
                state: 'Sindh',
                country: 'Pakistan',
                postalCode: '75500'
            },
            location: {
                type: 'Point',
                coordinates: [67.0011, 24.8607]
            },
            contact: {
                primaryPhone: '+923001234567',
                email: 'venue@example.com'
            },
            amenities: {
                totalCourts: 5
            },
            owner: user._id
        });

        // Create test court
        court = await Court.create({
            name: 'Test Court',
            venue: venue._id,
            sportType: 'tennis',
            courtType: 'outdoor',
            baseHourlyRate: 1000,
            owner: user._id,
            operatingHours: [
                { dayOfWeek: 0, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 1, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 2, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 3, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 4, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 5, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 6, openTime: '08:00', closeTime: '20:00', isClosed: false }
            ]
        });
    });

    describe('Booking Creation', () => {
        it('should create a booking with valid data', async () => {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

            const booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                pricing: {
                    basePrice: 2000,
                    subtotal: 2000,
                    totalAmount: 2100
                },
                payment: {
                    amount: 2100,
                    currency: 'PKR',
                    status: 'pending'
                }
            });

            expect(booking.bookingNumber).toBeDefined();
            expect(booking.status).toBe('pending-confirmation');
            expect(booking.duration).toBe(120); // 2 hours in minutes
        });

        it('should generate unique booking number', async () => {
            const startTime1 = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime1 = new Date(startTime1.getTime() + 2 * 60 * 60 * 1000);

            const booking1 = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime: startTime1,
                endTime: endTime1,
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });

            const startTime2 = new Date(Date.now() + 25 * 60 * 60 * 1000);
            const endTime2 = new Date(startTime2.getTime() + 2 * 60 * 60 * 1000);

            const booking2 = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime: startTime2,
                endTime: endTime2,
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });

            expect(booking1.bookingNumber).not.toBe(booking2.bookingNumber);
        });
    });

    describe('Conflict Detection', () => {
        it('should detect overlapping bookings', async () => {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            // Create first booking
            await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });

            // Check for conflicts with overlapping time
            const conflictStart = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour after start
            const conflictEnd = new Date(endTime.getTime() + 60 * 60 * 1000);

            const conflicts = await Booking.checkConflicts(court._id, conflictStart, conflictEnd);

            expect(conflicts.length).toBeGreaterThan(0);
        });

        it('should not detect conflicts for non-overlapping bookings', async () => {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            // Create first booking
            await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });

            // Check for conflicts with non-overlapping time
            const newStart = new Date(endTime.getTime() + 60 * 60 * 1000); // 1 hour after end
            const newEnd = new Date(newStart.getTime() + 2 * 60 * 60 * 1000);

            const conflicts = await Booking.checkConflicts(court._id, newStart, newEnd);

            expect(conflicts.length).toBe(0);
        });
    });

    describe('Cancellation Refund Calculation', () => {
        it('should calculate 100% refund for cancellation 24+ hours before', async () => {
            const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            const booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'completed' }
            });

            const refundInfo = booking.calculateCancellationRefund();

            expect(refundInfo.refundPercentage).toBe(100);
            expect(refundInfo.refundAmount).toBe(2100);
        });

        it('should calculate 75% refund for cancellation 12-24 hours before', async () => {
            const startTime = new Date(Date.now() + 18 * 60 * 60 * 1000); // 18 hours from now
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            const booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'completed' }
            });

            const refundInfo = booking.calculateCancellationRefund();

            expect(refundInfo.refundPercentage).toBe(75);
            expect(refundInfo.refundAmount).toBe(1575);
        });

        it('should calculate no refund for cancellation less than 2 hours before', async () => {
            const startTime = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour from now
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            const booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'completed' }
            });

            const refundInfo = booking.calculateCancellationRefund();

            expect(refundInfo.refundPercentage).toBe(0);
            expect(refundInfo.refundAmount).toBe(0);
        });
    });

    describe('Booking Modification Rules', () => {
        it('should allow modification of confirmed booking 2+ hours before', async () => {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            const booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });

            const canModify = booking.canBeModified();

            expect(canModify.allowed).toBe(true);
        });

        it('should not allow modification of completed booking', async () => {
            const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            const booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'completed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'completed' }
            });

            const canModify = booking.canBeModified();

            expect(canModify.allowed).toBe(false);
        });
    });
});

describe('Booking Controller', () => {
    let mockReq, mockRes, mockNext;
    let user, owner, manager, venue, court;

    beforeEach(async () => {
        // Create users
        user = await User.create({
            firstName: 'Regular',
            lastName: 'User',
            email: 'user@example.com',
            password: 'Password123!',
            role: 'user'
        });

        owner = await User.create({
            firstName: 'Owner',
            lastName: 'User',
            email: 'owner@example.com',
            password: 'Password123!',
            role: 'owner'
        });

        manager = await User.create({
            firstName: 'Manager',
            lastName: 'User',
            email: 'manager@example.com',
            password: 'Password123!',
            role: 'manager'
        });

        // Create venue
        venue = await Venue.create({
            name: 'Test Sports Complex',
            address: {
                street: '123 Main St',
                city: 'Karachi',
                state: 'Sindh',
                country: 'Pakistan'
            },
            location: {
                type: 'Point',
                coordinates: [67.0011, 24.8607]
            },
            contact: {
                primaryPhone: '+923001234567',
                email: 'venue@example.com'
            },
            amenities: {
                totalCourts: 5
            },
            owner: owner._id,
            managers: [manager._id]
        });

        // Create court
        court = await Court.create({
            name: 'Test Court',
            venue: venue._id,
            sportType: 'tennis',
            courtType: 'outdoor',
            baseHourlyRate: 1000,
            owner: owner._id,
            operatingHours: [
                { dayOfWeek: 0, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 1, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 2, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 3, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 4, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 5, openTime: '08:00', closeTime: '20:00', isClosed: false },
                { dayOfWeek: 6, openTime: '08:00', closeTime: '20:00', isClosed: false }
            ],
            bookingSettings: {
                minBookingDuration: 60,
                maxBookingDuration: 180,
                requiresApproval: false,
                maxConcurrentBookingsPerUser: 3
            }
        });

        // Setup mock objects
        mockReq = {
            body: {},
            params: {},
            query: {},
            user: null,
            ip: '127.0.0.1',
            get: jest.fn(() => 'test-user-agent')
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        mockNext = jest.fn();
    });

    describe('createBooking', () => {
        it('should create a single booking successfully', async () => {
            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.body = {
                court: court._id.toString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                groupSize: 2
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        bookingNumber: expect.any(String),
                        status: 'confirmed'
                    })
                })
            );
        });

        it('should reject booking for non-existent court', async () => {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.body = {
                court: '507f1f77bcf86cd799439011',
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString()
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Court not found'
                })
            );
        });

        it('should reject booking with duration less than minimum', async () => {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes

            mockReq.user = user;
            mockReq.body = {
                court: court._id.toString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString()
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Minimum booking duration')
                })
            );
        });

        it('should reject booking for conflicting time slot', async () => {
            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            // Create first booking
            await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });

            // Try to create overlapping booking
            const conflictStart = new Date(startTime.getTime() + 60 * 60 * 1000);
            const conflictEnd = new Date(endTime.getTime() + 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.body = {
                court: court._id.toString(),
                startTime: conflictStart.toISOString(),
                endTime: conflictEnd.toISOString()
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(409);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Time slot is already booked'
                })
            );
        });
    });

    describe('createBooking with promo codes', () => {
        let promo;

        beforeEach(async () => {
            promo = await PromoCode.create({
                code: 'SAVE10',
                discountType: 'percentage',
                discountValue: 10,
                validFrom: new Date(Date.now() - 86400000),
                validUntil: new Date(Date.now() + 86400000),
                usageLimitPerUser: 1,
                createdBy: owner._id
            });
        });

        it('should apply a valid promo code and record its usage', async () => {
            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.body = {
                court: court._id.toString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                couponCode: 'save10'
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);

            const created = await Booking.findOne({ user: user._id });
            expect(created.promoCode.toString()).toBe(promo._id.toString());
            expect(created.pricing.discounts).toEqual(
                expect.arrayContaining([expect.objectContaining({ type: 'coupon', name: 'SAVE10' })])
            );
            expect(created.pricing.totalDiscount).toBeGreaterThan(0);

            const updatedPromo = await PromoCode.findById(promo._id);
            expect(updatedPromo.usedCount).toBe(1);
        });

        it('should reject an unknown promo code', async () => {
            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.body = {
                court: court._id.toString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                couponCode: 'NOPE'
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should reject a promo code once the per-user usage limit is reached', async () => {
            const firstStart = getSlotTime(1);
            const firstEnd = new Date(firstStart.getTime() + 2 * 60 * 60 * 1000);

            await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                promoCode: promo._id,
                startTime: firstStart,
                endTime: firstEnd,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 1800, totalAmount: 1890 },
                payment: { amount: 1890, currency: 'PKR', status: 'pending' }
            });

            const secondStart = getSlotTime(2);
            const secondEnd = new Date(secondStart.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.body = {
                court: court._id.toString(),
                startTime: secondStart.toISOString(),
                endTime: secondEnd.toISOString(),
                couponCode: 'SAVE10'
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('createBooking with wallet', () => {
        it('should fully cover the booking from wallet balance with no Stripe charge needed', async () => {
            await User.creditWallet(user._id, 5000, { source: 'admin_adjustment' });
            const funded = await User.findById(user._id);

            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = funded;
            mockReq.body = {
                court: court._id.toString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                useWallet: true
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);

            const created = await Booking.findOne({ user: user._id });
            expect(created.pricing.walletAmountApplied).toBe(2100);
            expect(created.isPaid).toBe(true);
            expect(created.payment.status).toBe('completed');
            expect(created.payment.method).toBe('wallet');

            const payment = await Payment.findOne({ booking: created._id });
            expect(payment.gateway).toBe('wallet');
            expect(payment.status).toBe('succeeded');

            const reloadedUser = await User.findById(user._id);
            expect(reloadedUser.walletBalance).toBe(5000 - 2100);
            expect(reloadedUser.loyaltyPoints).toBe(Math.floor(2100 * 0.05));
        });

        it('should partially cover the booking from an insufficient wallet balance and leave it pending gateway payment', async () => {
            await User.creditWallet(user._id, 500, { source: 'admin_adjustment' });
            const funded = await User.findById(user._id);

            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = funded;
            mockReq.body = {
                court: court._id.toString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                useWallet: true
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);

            const created = await Booking.findOne({ user: user._id });
            expect(created.pricing.walletAmountApplied).toBe(500);
            expect(created.isPaid).toBe(false);
            expect(created.payment.status).toBe('pending');

            const reloadedUser = await User.findById(user._id);
            expect(reloadedUser.walletBalance).toBe(0);
            // Not yet fully paid - loyalty points only award once the
            // booking's payment actually completes (here, on the later
            // Stripe webhook).
            expect(reloadedUser.loyaltyPoints).toBe(0);
        });

        it('should fall back to normal gateway payment when the wallet has no balance', async () => {
            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.body = {
                court: court._id.toString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                useWallet: true
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);

            const created = await Booking.findOne({ user: user._id });
            expect(created.pricing.walletAmountApplied).toBe(0);
            expect(created.isPaid).toBe(false);
        });

        it('should not apply wallet balance when useWallet is not set', async () => {
            await User.creditWallet(user._id, 5000, { source: 'admin_adjustment' });
            const funded = await User.findById(user._id);

            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = funded;
            mockReq.body = {
                court: court._id.toString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString()
            };

            await createBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);

            const created = await Booking.findOne({ user: user._id });
            expect(created.pricing.walletAmountApplied).toBe(0);

            const reloadedUser = await User.findById(user._id);
            expect(reloadedUser.walletBalance).toBe(5000);
        });
    });

    describe('getBookings', () => {
        beforeEach(async () => {
            // Create multiple bookings
            const startTime1 = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime1 = new Date(startTime1.getTime() + 2 * 60 * 60 * 1000);

            const startTime2 = new Date(Date.now() + 48 * 60 * 60 * 1000);
            const endTime2 = new Date(startTime2.getTime() + 2 * 60 * 60 * 1000);

            await Booking.create([
                {
                    user: user._id,
                    court: court._id,
                    venue: venue._id,
                    startTime: startTime1,
                    endTime: endTime1,
                    status: 'confirmed',
                    pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                    payment: { amount: 2100, currency: 'PKR', status: 'pending' }
                },
                {
                    user: user._id,
                    court: court._id,
                    venue: venue._id,
                    startTime: startTime2,
                    endTime: endTime2,
                    status: 'pending-confirmation',
                    pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                    payment: { amount: 2100, currency: 'PKR', status: 'pending' }
                }
            ]);
        });

        it('should get user\'s own bookings', async () => {
            mockReq.user = user;
            mockReq.query = {};

            await getBookings(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: expect.any(Number),
                    data: expect.any(Array)
                })
            );
        });

        it('should filter bookings by status', async () => {
            mockReq.user = user;
            mockReq.query = { status: 'confirmed' };

            await getBookings(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.every(b => b.status === 'confirmed')).toBe(true);
        });

        it('should paginate results', async () => {
            mockReq.user = user;
            mockReq.query = { page: 1, limit: 1 };

            await getBookings(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.count).toBeLessThanOrEqual(1);
            expect(response.totalPages).toBeGreaterThanOrEqual(1);
        });
    });

    describe('getBooking', () => {
        let booking;

        beforeEach(async () => {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });
        });

        it('should get booking by ID', async () => {
            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };

            await getBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        _id: booking._id
                    })
                })
            );
        });

        it('should get booking by booking number', async () => {
            mockReq.user = user;
            mockReq.params = { id: booking.bookingNumber };

            await getBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        bookingNumber: booking.bookingNumber
                    })
                })
            );
        });

        it('should return 404 for non-existent booking', async () => {
            mockReq.user = user;
            mockReq.params = { id: '507f1f77bcf86cd799439011' };

            await getBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Booking not found'
                })
            );
        });

        it('should not allow unauthorized user to view booking', async () => {
            const otherUser = await User.create({
                firstName: 'Other',
                lastName: 'User',
                email: 'other@example.com',
                password: 'Password123!'
            });

            mockReq.user = otherUser;
            mockReq.params = { id: booking._id.toString() };

            await getBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('updateBooking', () => {
        let booking;

        beforeEach(async () => {
            const startTime = getSlotTime(2);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });
        });

        it('should update booking notes', async () => {
            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = {
                notes: 'Updated notes',
                specialRequests: 'Need extra towels'
            };

            await updateBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Booking updated successfully'
                })
            );
        });

        it('should reschedule booking to new time', async () => {
            const newStartTime = getSlotTime(3);
            const newEndTime = new Date(newStartTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = {
                startTime: newStartTime.toISOString(),
                endTime: newEndTime.toISOString(),
                modificationReason: 'Schedule conflict'
            };

            await updateBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Booking updated successfully'
                })
            );
        });

        it('should not allow unauthorized user to update booking', async () => {
            const otherUser = await User.create({
                firstName: 'Other',
                lastName: 'User',
                email: 'other@example.com',
                password: 'Password123!'
            });

            mockReq.user = otherUser;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = { notes: 'Hacked' };

            await updateBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });

        it('should not charge a reschedule fee more than 24h before start', async () => {
            const newStartTime = getSlotTime(3);
            const newEndTime = new Date(newStartTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = {
                startTime: newStartTime.toISOString(),
                endTime: newEndTime.toISOString()
            };

            await updateBooking(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.rescheduleFeeInfo.feePercentage).toBe(0);
            expect(response.data.rescheduleFeeInfo.feeAmount).toBe(0);
        });

        it('should charge a tiered reschedule fee from the wallet when rescheduling close to start time', async () => {
            const soonBooking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime: new Date(Date.now() + 10 * 60 * 60 * 1000), // 10h out -> 20% tier
                endTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2000 },
                payment: { amount: 2000, currency: 'PKR', status: 'completed' }
            });
            await User.findByIdAndUpdate(user._id, { walletBalance: 1000 });

            const newStartTime = getSlotTime(5);
            const newEndTime = new Date(newStartTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.params = { id: soonBooking._id.toString() };
            mockReq.body = {
                startTime: newStartTime.toISOString(),
                endTime: newEndTime.toISOString()
            };

            await updateBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.rescheduleFeeInfo.feePercentage).toBe(20);
            expect(response.data.rescheduleFeeInfo.feeAmount).toBe(400); // 20% of 2000

            const updatedUser = await User.findById(user._id);
            expect(updatedUser.walletBalance).toBe(600); // 1000 - 400

            const ledgerEntry = await WalletTransaction.findOne({ user: user._id, source: 'reschedule_fee' });
            expect(ledgerEntry).not.toBeNull();
            expect(ledgerEntry.amount).toBe(400);
        });

        it('should reject the reschedule with 402 when the wallet cannot cover the fee', async () => {
            const soonBooking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime: new Date(Date.now() + 10 * 60 * 60 * 1000), // 10h out -> 20% tier
                endTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2000 },
                payment: { amount: 2000, currency: 'PKR', status: 'completed' }
            });
            await User.findByIdAndUpdate(user._id, { walletBalance: 50 });

            const newStartTime = getSlotTime(5);
            const newEndTime = new Date(newStartTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.user = user;
            mockReq.params = { id: soonBooking._id.toString() };
            mockReq.body = {
                startTime: newStartTime.toISOString(),
                endTime: newEndTime.toISOString()
            };

            await updateBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(402);

            const unchangedBooking = await Booking.findById(soonBooking._id);
            expect(unchangedBooking.startTime.toISOString()).toBe(soonBooking.startTime.toISOString());

            const updatedUser = await User.findById(user._id);
            expect(updatedUser.walletBalance).toBe(50); // untouched
        });
    });

    describe('cancelBooking', () => {
        let booking;

        beforeEach(async () => {
            const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'completed' },
                isPaid: true
            });
        });

        it('should cancel booking with refund info', async () => {
            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = {
                reason: 'Personal emergency'
            };

            await cancelBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Booking cancelled successfully',
                    data: expect.objectContaining({
                        refundInfo: expect.objectContaining({
                            refundEligible: true,
                            refundPercentage: 100
                        })
                    })
                })
            );
        });

        it('should require cancellation reason', async () => {
            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = {};

            await cancelBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Cancellation reason is required'
                })
            );
        });

        it('should process a real gateway refund when a succeeded payment exists', async () => {
            await Payment.create({
                booking: booking._id,
                user: user._id,
                gateway: 'stripe',
                gatewayPaymentIntentId: 'pi_test_123',
                amount: 2100,
                currency: 'PKR',
                status: 'succeeded'
            });

            Stripe.__mockRefunds.create.mockClear();

            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = { reason: 'Personal emergency' };

            await cancelBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(Stripe.__mockRefunds.create).toHaveBeenCalledWith(
                expect.objectContaining({ payment_intent: 'pi_test_123', amount: 210000 })
            );

            const updatedPayment = await Payment.findOne({ booking: booking._id });
            expect(updatedPayment.status).toBe('refunded');
            expect(updatedPayment.refunds).toHaveLength(1);

            const updatedBooking = await Booking.findById(booking._id);
            expect(updatedBooking.payment.status).toBe('refunded');

            const auditEntry = await AuditLog.findOne({ action: 'payment.refunded', resourceId: updatedBooking._id });
            expect(auditEntry).not.toBeNull();
            expect(auditEntry.changes.get('gatewayRefunded')).toBe(2100);
        });

        it('should credit the wallet back (not attempt a gateway refund) when the booking was paid via wallet', async () => {
            booking.pricing.walletAmountApplied = 2100;
            booking.payment.status = 'completed';
            booking.payment.method = 'wallet';
            await booking.save();

            await Payment.create({
                booking: booking._id,
                user: user._id,
                gateway: 'wallet',
                amount: 2100,
                currency: 'PKR',
                status: 'succeeded'
            });

            Stripe.__mockRefunds.create.mockClear();

            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = { reason: 'Personal emergency' };

            await cancelBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(Stripe.__mockRefunds.create).not.toHaveBeenCalled();

            const reloadedUser = await User.findById(user._id);
            expect(reloadedUser.walletBalance).toBe(2100);

            const walletTx = await WalletTransaction.findOne({ user: user._id, source: 'refund' });
            expect(walletTx).not.toBeNull();
            expect(walletTx.amount).toBe(2100);

            const updatedBooking = await Booking.findById(booking._id);
            expect(updatedBooking.payment.status).toBe('refunded');
        });

        it('should split a refund between wallet credit-back and a gateway refund for a mixed-payment booking', async () => {
            booking.pricing.walletAmountApplied = 500;
            booking.payment.status = 'completed';
            await booking.save();

            await Payment.create({
                booking: booking._id,
                user: user._id,
                gateway: 'stripe',
                gatewayPaymentIntentId: 'pi_test_123',
                amount: 1600,
                currency: 'PKR',
                status: 'succeeded'
            });

            Stripe.__mockRefunds.create.mockClear();

            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = { reason: 'Personal emergency' };

            await cancelBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            // 100% refund-eligible (48h out): wallet covers its 500, Stripe refunds the remaining 1600.
            expect(Stripe.__mockRefunds.create).toHaveBeenCalledWith(
                expect.objectContaining({ payment_intent: 'pi_test_123', amount: 160000 })
            );

            const reloadedUser = await User.findById(user._id);
            expect(reloadedUser.walletBalance).toBe(500);
        });
    });

    describe('checkAvailability', () => {
        it('should return available for free time slot', async () => {
            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            mockReq.body = {
                court: court._id.toString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString()
            };

            await checkAvailability(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    available: true
                })
            );
        });

        it('should return unavailable for booked time slot', async () => {
            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            // Create booking
            await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });

            mockReq.body = {
                court: court._id.toString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString()
            };

            await checkAvailability(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    available: false
                })
            );
        });
    });

    describe('getAvailableSlots', () => {
        it('should return available slots for a date', async () => {
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const dateStr = tomorrow.toISOString().split('T')[0];

            mockReq.params = { courtId: court._id.toString() };
            mockReq.query = { date: dateStr, interval: 60 };

            await getAvailableSlots(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.any(Array)
                })
            );
        });

        it('should require date parameter', async () => {
            mockReq.params = { courtId: court._id.toString() };
            mockReq.query = {};

            await getAvailableSlots(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('approveBooking', () => {
        let booking;

        beforeEach(async () => {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'pending-confirmation',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });
        });

        it('should approve booking as owner', async () => {
            mockReq.user = owner;
            mockReq.params = { id: booking._id.toString() };

            await approveBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Booking approved successfully'
                })
            );
        });

        it('should not approve booking as regular user', async () => {
            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };

            await approveBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('rejectBooking', () => {
        let booking;

        beforeEach(async () => {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'pending-confirmation',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });
        });

        it('should reject booking with reason', async () => {
            mockReq.user = owner;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = {
                reason: 'Court maintenance scheduled'
            };

            await rejectBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Booking rejected successfully'
                })
            );
        });

        it('should require rejection reason', async () => {
            mockReq.user = owner;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = {};

            await rejectBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should refund a paid booking on rejection', async () => {
            booking.isPaid = true;
            booking.payment.status = 'completed';
            await booking.save();

            await Payment.create({
                booking: booking._id,
                user: user._id,
                gateway: 'stripe',
                gatewayPaymentIntentId: 'pi_test_123',
                amount: 2100,
                currency: 'PKR',
                status: 'succeeded'
            });

            Stripe.__mockRefunds.create.mockClear();

            mockReq.user = owner;
            mockReq.params = { id: booking._id.toString() };
            mockReq.body = { reason: 'Court maintenance scheduled' };

            await rejectBooking(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(Stripe.__mockRefunds.create).toHaveBeenCalledWith(
                expect.objectContaining({ payment_intent: 'pi_test_123', amount: 210000 })
            );

            const updatedBooking = await Booking.findById(booking._id);
            expect(updatedBooking.payment.status).toBe('refunded');
        });
    });

    describe('checkIn', () => {
        let booking;

        beforeEach(async () => {
            const startTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'completed' }
            });
        });

        it('should check in to booking', async () => {
            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };

            await checkIn(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Checked in successfully'
                })
            );
        });

        it('should not allow check-in for non-confirmed booking', async () => {
            booking.status = 'pending-confirmation';
            await booking.save();

            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };

            await checkIn(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('checkOut', () => {
        let booking;

        beforeEach(async () => {
            const startTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
            const endTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

            booking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'in-progress',
                checkIn: {
                    time: startTime,
                    verifiedBy: user._id
                },
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'completed' }
            });
        });

        it('should check out from booking', async () => {
            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };

            await checkOut(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Checked out successfully'
                })
            );
        });

        it('should not allow check-out for non-in-progress booking', async () => {
            booking.status = 'confirmed';
            await booking.save();

            mockReq.user = user;
            mockReq.params = { id: booking._id.toString() };

            await checkOut(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('getMyBookings', () => {
        beforeEach(async () => {
            const startTime1 = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime1 = new Date(startTime1.getTime() + 2 * 60 * 60 * 1000);

            const startTime2 = new Date(Date.now() + 48 * 60 * 60 * 1000);
            const endTime2 = new Date(startTime2.getTime() + 2 * 60 * 60 * 1000);

            await Booking.create([
                {
                    user: user._id,
                    court: court._id,
                    venue: venue._id,
                    startTime: startTime1,
                    endTime: endTime1,
                    status: 'confirmed',
                    pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                    payment: { amount: 2100, currency: 'PKR', status: 'pending' }
                },
                {
                    user: user._id,
                    court: court._id,
                    venue: venue._id,
                    startTime: startTime2,
                    endTime: endTime2,
                    status: 'confirmed',
                    pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                    payment: { amount: 2100, currency: 'PKR', status: 'pending' }
                }
            ]);
        });

        it('should get user\'s bookings with stats', async () => {
            mockReq.user = user;
            mockReq.query = {};

            await getMyBookings(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    stats: expect.any(Object),
                    data: expect.any(Array)
                })
            );
        });

        it('should filter upcoming bookings', async () => {
            mockReq.user = user;
            mockReq.query = { upcoming: 'true' };

            await getMyBookings(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.every(b => new Date(b.startTime) >= new Date())).toBe(true);
        });
    });

    describe('Waitlist', () => {
        let occupant, startTime, endTime;

        beforeEach(async () => {
            startTime = getSlotTime(1);
            endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            occupant = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });
        });

        describe('createBooking with joinWaitlist', () => {
            it('should join the waitlist instead of failing with 409 when joinWaitlist is true', async () => {
                const joiner = await User.create({
                    firstName: 'Joiner', lastName: 'One', email: 'joiner1@example.com', password: 'Password123!'
                });

                mockReq.user = joiner;
                mockReq.body = {
                    court: court._id.toString(),
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    joinWaitlist: true
                };

                await createBooking(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(201);
                expect(mockRes.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: true,
                        message: expect.stringContaining('waitlist'),
                        data: expect.objectContaining({ status: 'waitlisted', waitlistPosition: 1 })
                    })
                );
            });

            it('should still return 409 when joinWaitlist is not set', async () => {
                const joiner = await User.create({
                    firstName: 'Joiner', lastName: 'Two', email: 'joiner2@example.com', password: 'Password123!'
                });

                mockReq.user = joiner;
                mockReq.body = {
                    court: court._id.toString(),
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString()
                };

                await createBooking(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(409);
            });

            it('should assign incrementing positions to multiple waitlist joiners', async () => {
                const joinerA = await User.create({
                    firstName: 'Joiner', lastName: 'A', email: 'joinera@example.com', password: 'Password123!'
                });
                const joinerB = await User.create({
                    firstName: 'Joiner', lastName: 'B', email: 'joinerb@example.com', password: 'Password123!'
                });

                mockReq.user = joinerA;
                mockReq.body = {
                    court: court._id.toString(),
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    joinWaitlist: true
                };
                await createBooking(mockReq, mockRes, mockNext);
                expect(mockRes.json.mock.calls[0][0].data.waitlistPosition).toBe(1);

                mockRes.status.mockClear();
                mockRes.json.mockClear();

                mockReq.user = joinerB;
                await createBooking(mockReq, mockRes, mockNext);
                expect(mockRes.json.mock.calls[0][0].data.waitlistPosition).toBe(2);
            });

            it('should reject joining a waitlist for a recurring booking', async () => {
                const joiner = await User.create({
                    firstName: 'Joiner', lastName: 'C', email: 'joinerc@example.com', password: 'Password123!'
                });

                mockReq.user = joiner;
                mockReq.body = {
                    court: court._id.toString(),
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    joinWaitlist: true,
                    bookingType: 'recurring',
                    recurringPattern: { frequency: 'weekly', occurrences: 4 }
                };

                await createBooking(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(400);
            });
        });

        describe('Booking.settleWaitlist', () => {
            it('should promote the front of the queue once the occupant cancels', async () => {
                const waitlisted = await Booking.create({
                    user: manager._id,
                    court: court._id,
                    venue: venue._id,
                    startTime,
                    endTime,
                    status: 'waitlisted',
                    isWaitlisted: true,
                    waitlistPosition: 1,
                    pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                    payment: { amount: 2100, currency: 'PKR', status: 'pending' }
                });

                await Booking.findByIdAndUpdate(occupant._id, { status: 'cancelled' });

                const promoted = await Booking.settleWaitlist(court._id, startTime, endTime);

                expect(promoted).not.toBeNull();
                expect(promoted._id.toString()).toBe(waitlisted._id.toString());
                expect(promoted.status).toBe('confirmed');
                expect(promoted.isWaitlisted).toBe(false);
            });

            it('should not promote anyone while the slot is still occupied', async () => {
                await Booking.create({
                    user: manager._id,
                    court: court._id,
                    venue: venue._id,
                    startTime,
                    endTime,
                    status: 'waitlisted',
                    isWaitlisted: true,
                    waitlistPosition: 1,
                    pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                    payment: { amount: 2100, currency: 'PKR', status: 'pending' }
                });

                const promoted = await Booking.settleWaitlist(court._id, startTime, endTime);

                expect(promoted).toBeNull();
            });

            it('should renumber the remaining queue after a promotion', async () => {
                const second = await User.create({
                    firstName: 'Second', lastName: 'Waiter', email: 'secondwaiter@example.com', password: 'Password123!'
                });

                const first = await Booking.create({
                    user: manager._id, court: court._id, venue: venue._id, startTime, endTime,
                    status: 'waitlisted', isWaitlisted: true, waitlistPosition: 1,
                    pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                    payment: { amount: 2100, currency: 'PKR', status: 'pending' }
                });
                const secondEntry = await Booking.create({
                    user: second._id, court: court._id, venue: venue._id, startTime, endTime,
                    status: 'waitlisted', isWaitlisted: true, waitlistPosition: 2,
                    pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                    payment: { amount: 2100, currency: 'PKR', status: 'pending' }
                });

                await Booking.findByIdAndUpdate(occupant._id, { status: 'cancelled' });
                await Booking.settleWaitlist(court._id, startTime, endTime);

                const updatedSecond = await Booking.findById(secondEntry._id);
                expect(updatedSecond.status).toBe('waitlisted');
                expect(updatedSecond.waitlistPosition).toBe(1);
            });

            it('should be race-safe: a second concurrent call promotes no one', async () => {
                await Booking.create({
                    user: manager._id, court: court._id, venue: venue._id, startTime, endTime,
                    status: 'waitlisted', isWaitlisted: true, waitlistPosition: 1,
                    pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                    payment: { amount: 2100, currency: 'PKR', status: 'pending' }
                });
                await Booking.findByIdAndUpdate(occupant._id, { status: 'cancelled' });

                const [first, second] = await Promise.all([
                    Booking.settleWaitlist(court._id, startTime, endTime),
                    Booking.settleWaitlist(court._id, startTime, endTime)
                ]);

                const promotedCount = [first, second].filter(Boolean).length;
                expect(promotedCount).toBe(1);
            });
        });

        describe('cancelBooking triggers promotion', () => {
            it('should promote the next waitlisted booking when the occupant cancels', async () => {
                const waitlisted = await Booking.create({
                    user: manager._id,
                    court: court._id,
                    venue: venue._id,
                    startTime,
                    endTime,
                    status: 'waitlisted',
                    isWaitlisted: true,
                    waitlistPosition: 1,
                    pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                    payment: { amount: 2100, currency: 'PKR', status: 'pending' }
                });

                mockReq.user = user;
                mockReq.params = { id: occupant._id.toString() };
                mockReq.body = { reason: 'Change of plans' };

                await cancelBooking(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(200);

                const updatedWaitlisted = await Booking.findById(waitlisted._id);
                expect(updatedWaitlisted.status).toBe('confirmed');
            });
        });
    });

    describe('Group Booking Participants', () => {
        let groupBooking;

        beforeEach(async () => {
            const startTime = getSlotTime(1);
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

            groupBooking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime,
                endTime,
                status: 'confirmed',
                isGroupBooking: true,
                groupSize: 3,
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
                payment: { amount: 2100, currency: 'PKR', status: 'pending' }
            });
        });

        describe('inviteParticipant', () => {
            it('should invite a registered user by ID', async () => {
                mockReq.user = user;
                mockReq.params = { id: groupBooking._id.toString() };
                mockReq.body = { user: manager._id.toString() };

                await inviteParticipant(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(201);

                const updated = await Booking.findById(groupBooking._id);
                expect(updated.participants).toHaveLength(1);
                expect(updated.participants[0].user.toString()).toBe(manager._id.toString());
                expect(updated.participants[0].status).toBe('invited');
            });

            it('should invite a guest by name/email', async () => {
                mockReq.user = user;
                mockReq.params = { id: groupBooking._id.toString() };
                mockReq.body = { name: 'Guest Player', email: 'guest@example.com' };

                await inviteParticipant(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(201);

                const updated = await Booking.findById(groupBooking._id);
                expect(updated.participants).toHaveLength(1);
                expect(updated.participants[0].user).toBeUndefined();
                expect(updated.participants[0].email).toBe('guest@example.com');
            });

            it('should reject invites once the group is full', async () => {
                groupBooking.groupSize = 2;
                groupBooking.participants.push({ name: 'Already In', email: 'in@example.com', status: 'invited' });
                await groupBooking.save();

                mockReq.user = user;
                mockReq.params = { id: groupBooking._id.toString() };
                mockReq.body = { name: 'One Too Many', email: 'toomany@example.com' };

                await inviteParticipant(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(400);
            });

            it('should reject invites from a user who is not the owner or group leader', async () => {
                mockReq.user = manager;
                mockReq.params = { id: groupBooking._id.toString() };
                mockReq.body = { name: 'Guest', email: 'guest2@example.com' };

                await inviteParticipant(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(403);
            });
        });

        describe('respondToParticipant', () => {
            it('should let the invited registered user confirm', async () => {
                groupBooking.participants.push({ user: manager._id, name: 'Manager User', email: 'manager@example.com', status: 'invited' });
                await groupBooking.save();
                const participantId = groupBooking.participants[0]._id.toString();

                mockReq.user = manager;
                mockReq.params = { id: groupBooking._id.toString(), participantId };
                mockReq.body = { status: 'confirmed' };

                await respondToParticipant(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(200);

                const updated = await Booking.findById(groupBooking._id);
                expect(updated.participants[0].status).toBe('confirmed');
            });

            it('should reject a response from an unrelated user', async () => {
                groupBooking.participants.push({ user: manager._id, name: 'Manager User', email: 'manager@example.com', status: 'invited' });
                await groupBooking.save();
                const participantId = groupBooking.participants[0]._id.toString();

                const stranger = await User.create({
                    firstName: 'Stranger', lastName: 'Danger', email: 'strangerbooking@example.com', password: 'Password123!'
                });

                mockReq.user = stranger;
                mockReq.params = { id: groupBooking._id.toString(), participantId };
                mockReq.body = { status: 'confirmed' };

                await respondToParticipant(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(403);
            });
        });

        describe('removeParticipant', () => {
            it('should let the booking owner remove a participant', async () => {
                groupBooking.participants.push({ name: 'Guest', email: 'guest3@example.com', status: 'invited' });
                await groupBooking.save();
                const participantId = groupBooking.participants[0]._id.toString();

                mockReq.user = user;
                mockReq.params = { id: groupBooking._id.toString(), participantId };

                await removeParticipant(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(200);

                const updated = await Booking.findById(groupBooking._id);
                expect(updated.participants).toHaveLength(0);
            });

            it('should let a participant remove themself', async () => {
                groupBooking.participants.push({ user: manager._id, name: 'Manager User', email: 'manager@example.com', status: 'confirmed' });
                await groupBooking.save();
                const participantId = groupBooking.participants[0]._id.toString();

                mockReq.user = manager;
                mockReq.params = { id: groupBooking._id.toString(), participantId };

                await removeParticipant(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(200);
            });

            it('should reject removal by an unrelated user', async () => {
                groupBooking.participants.push({ name: 'Guest', email: 'guest4@example.com', status: 'invited' });
                await groupBooking.save();
                const participantId = groupBooking.participants[0]._id.toString();

                const stranger = await User.create({
                    firstName: 'Stranger', lastName: 'Two', email: 'strangertwo@example.com', password: 'Password123!'
                });

                mockReq.user = stranger;
                mockReq.params = { id: groupBooking._id.toString(), participantId };

                await removeParticipant(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(403);
            });
        });
    });
});
