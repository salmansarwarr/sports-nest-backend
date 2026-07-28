const Booking = require('../../src/models/Booking');
const Court = require('../../src/models/Court');
const Venue = require('../../src/models/Venue');
const User = require('../../src/models/User');
const {
    getRevenue,
    getOccupancy,
    getPopularCourts,
    getBookingsSummary,
} = require('../../src/controllers/analyticsController');

describe('Analytics Controller', () => {
    let mockReq, mockRes, mockNext;
    let ownerA, ownerB, admin, venueA, venueB, courtA, courtB, user;

    const fullWeekHours = Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i, openTime: '08:00', closeTime: '20:00', isClosed: false
    }));

    beforeEach(async () => {
        ownerA = await User.create({ firstName: 'Owner', lastName: 'A', email: 'ownera@example.com', password: 'Password123!', role: 'owner' });
        ownerB = await User.create({ firstName: 'Owner', lastName: 'B', email: 'ownerb@example.com', password: 'Password123!', role: 'owner' });
        admin = await User.create({ firstName: 'Admin', lastName: 'User', email: 'analyticsadmin@example.com', password: 'Password123!', role: 'admin' });
        user = await User.create({ firstName: 'Regular', lastName: 'User', email: 'analyticsuser@example.com', password: 'Password123!' });

        venueA = await Venue.create({
            name: 'Venue A', address: { street: '1 St', city: 'Karachi', state: 'Sindh', country: 'Pakistan' },
            location: { type: 'Point', coordinates: [67.0011, 24.8607] },
            contact: { primaryPhone: '+923001234567', email: 'venuea@example.com' },
            amenities: { totalCourts: 1 }, owner: ownerA._id
        });
        venueB = await Venue.create({
            name: 'Venue B', address: { street: '2 St', city: 'Karachi', state: 'Sindh', country: 'Pakistan' },
            location: { type: 'Point', coordinates: [67.01, 24.86] },
            contact: { primaryPhone: '+923001234568', email: 'venueb@example.com' },
            amenities: { totalCourts: 1 }, owner: ownerB._id
        });

        courtA = await Court.create({
            name: 'Court A', venue: venueA._id, sportType: 'tennis', courtType: 'outdoor',
            baseHourlyRate: 1000, owner: ownerA._id, operatingHours: fullWeekHours
        });
        courtB = await Court.create({
            name: 'Court B', venue: venueB._id, sportType: 'badminton', courtType: 'indoor',
            baseHourlyRate: 800, owner: ownerB._id, operatingHours: fullWeekHours
        });

        const day1 = new Date();
        day1.setDate(day1.getDate() - 2);
        day1.setHours(10, 0, 0, 0);
        const day1End = new Date(day1.getTime() + 2 * 60 * 60 * 1000);

        const day2 = new Date();
        day2.setDate(day2.getDate() - 1);
        day2.setHours(14, 0, 0, 0);
        const day2End = new Date(day2.getTime() + 1 * 60 * 60 * 1000);

        // 2 bookings on courtA (owner A), 1 on courtB (owner B)
        await Booking.create({
            user: user._id, court: courtA._id, venue: venueA._id, startTime: day1, endTime: day1End,
            status: 'completed', isPaid: true,
            pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100 },
            payment: { amount: 2100, currency: 'PKR', status: 'completed' }
        });
        await Booking.create({
            user: user._id, court: courtA._id, venue: venueA._id, startTime: day2, endTime: day2End,
            status: 'confirmed', isPaid: true,
            pricing: { basePrice: 1000, subtotal: 1000, totalAmount: 1050 },
            payment: { amount: 1050, currency: 'PKR', status: 'completed' }
        });
        await Booking.create({
            user: user._id, court: courtB._id, venue: venueB._id, startTime: day1, endTime: day1End,
            status: 'cancelled', isPaid: false,
            pricing: { basePrice: 800, subtotal: 800, totalAmount: 840 },
            payment: { amount: 840, currency: 'PKR', status: 'pending' }
        });

        mockReq = { body: {}, params: {}, query: {}, user: null };
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        mockNext = jest.fn();
    });

    describe('getRevenue', () => {
        it("should scope an owner's revenue to only their own courts", async () => {
            mockReq.user = ownerA;
            mockReq.query = {};

            await getRevenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.totals.totalRevenue).toBe(3150); // 2100 + 1050, not courtB's 840
        });

        it('should let an admin see revenue across all courts', async () => {
            mockReq.user = admin;
            mockReq.query = {};

            await getRevenue(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            // Only isPaid:true bookings count - courtB's cancelled booking is unpaid
            expect(response.data.totals.totalRevenue).toBe(3150);
        });
    });

    describe('getOccupancy', () => {
        it('should require startDate and endDate', async () => {
            mockReq.user = ownerA;
            mockReq.query = {};

            await getOccupancy(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it("should only return the owner's own courts", async () => {
            const start = new Date();
            start.setDate(start.getDate() - 3);
            const end = new Date();

            mockReq.user = ownerA;
            mockReq.query = { startDate: start.toISOString(), endDate: end.toISOString() };

            await getOccupancy(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data).toHaveLength(1);
            expect(response.data[0].court.toString()).toBe(courtA._id.toString());
            expect(response.data[0].occupancyRate).toBeGreaterThan(0);
        });
    });

    describe('getPopularCourts', () => {
        it('should rank courts by booking count within scope', async () => {
            mockReq.user = admin;
            mockReq.query = {};

            await getPopularCourts(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            // courtA has 2 non-cancelled bookings, courtB's only booking is cancelled (excluded)
            expect(response.data[0].court._id.toString()).toBe(courtA._id.toString());
            expect(response.data[0].bookingCount).toBe(2);
        });
    });

    describe('getBookingsSummary', () => {
        it("should scope status breakdown to the owner's own courts", async () => {
            mockReq.user = ownerB;
            mockReq.query = {};

            await getBookingsSummary(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.totals.totalBookings).toBe(1);
            expect(response.data.statusBreakdown).toEqual(
                expect.arrayContaining([expect.objectContaining({ _id: 'cancelled', count: 1 })])
            );
        });
    });
});
