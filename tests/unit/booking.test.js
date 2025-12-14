const Booking = require('../../src/models/Booking');
const Court = require('../../src/models/Court');
const Venue = require('../../src/models/Venue');
const User = require('../../src/models/User');
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
    getMyBookings
} = require('../../src/controllers/bookingController');

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
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
            const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
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
            const newStartTime = new Date(Date.now() + 72 * 60 * 60 * 1000);
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
    });

    describe('checkAvailability', () => {
        it('should return available for free time slot', async () => {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
});
