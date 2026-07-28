const User = require('../../src/models/User');
const LoyaltyTransaction = require('../../src/models/LoyaltyTransaction');
const WalletTransaction = require('../../src/models/WalletTransaction');
const Booking = require('../../src/models/Booking');
const Court = require('../../src/models/Court');
const Venue = require('../../src/models/Venue');
const { POINTS_TO_WALLET_RATE } = require('../../src/config/loyaltyRates');
const { awardBookingPoints } = require('../../src/utils/loyalty');
const {
    getLoyalty,
    getTransactions,
    redeemPoints,
} = require('../../src/controllers/loyaltyController');

describe('Loyalty', () => {
    let user;

    beforeEach(async () => {
        user = await User.create({
            firstName: 'Regular', lastName: 'User', email: 'user@example.com',
            password: 'Password123!', role: 'user'
        });
    });

    describe('User.earnLoyaltyPoints / redeemLoyaltyPoints statics', () => {
        it('should award points and record a ledger entry', async () => {
            const updated = await User.earnLoyaltyPoints(user._id, 100, { source: 'booking_completed' });

            expect(updated.loyaltyPoints).toBe(100);

            const tx = await LoyaltyTransaction.findOne({ user: user._id });
            expect(tx.type).toBe('earn');
            expect(tx.points).toBe(100);
            expect(tx.pointsBalanceAfter).toBe(100);
        });

        it('should reject zero/negative points as no-ops', async () => {
            expect(await User.earnLoyaltyPoints(user._id, 0, { source: 'booking_completed' })).toBeNull();
            expect(await User.redeemLoyaltyPoints(user._id, -5)).toBeNull();
        });

        it('should redeem points into wallet credit at POINTS_TO_WALLET_RATE and record both ledgers', async () => {
            await User.earnLoyaltyPoints(user._id, 200, { source: 'booking_completed' });

            const updated = await User.redeemLoyaltyPoints(user._id, 150);

            expect(updated.loyaltyPoints).toBe(50);
            expect(updated.walletBalance).toBe(150 * POINTS_TO_WALLET_RATE);

            const loyaltyTx = await LoyaltyTransaction.findOne({ user: user._id, type: 'redeem' });
            expect(loyaltyTx.points).toBe(150);
            expect(loyaltyTx.pointsBalanceAfter).toBe(50);

            const walletTx = await WalletTransaction.findOne({ user: user._id, source: 'loyalty_redemption' });
            expect(walletTx.amount).toBe(150 * POINTS_TO_WALLET_RATE);
        });

        it('should reject a redemption that exceeds the current points balance', async () => {
            await User.earnLoyaltyPoints(user._id, 50, { source: 'booking_completed' });

            const result = await User.redeemLoyaltyPoints(user._id, 100);

            expect(result).toBeNull();

            const reloaded = await User.findById(user._id);
            expect(reloaded.loyaltyPoints).toBe(50);
            expect(reloaded.walletBalance).toBe(0);
        });
    });

    describe('awardBookingPoints util', () => {
        let venue, court;

        beforeEach(async () => {
            venue = await Venue.create({
                name: 'Test Sports Complex',
                address: { street: '123 Main St', city: 'Karachi', state: 'Sindh', country: 'Pakistan' },
                location: { type: 'Point', coordinates: [67.0011, 24.8607] },
                contact: { primaryPhone: '+923001234567', email: 'venue@example.com' },
                amenities: { totalCourts: 5 },
                owner: user._id
            });
            court = await Court.create({
                name: 'Test Court', venue: venue._id, sportType: 'tennis', courtType: 'outdoor',
                baseHourlyRate: 1000, owner: user._id
            });
        });

        it('should floor the earned points to a whole number', async () => {
            const booking = await Booking.create({
                user: user._id, court: court._id, venue: venue._id,
                startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
                endTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2137, currency: 'PKR' },
                payment: { amount: 2137, currency: 'PKR', status: 'completed' }
            });

            await awardBookingPoints(booking);

            const reloaded = await User.findById(user._id);
            // 2137 * 0.05 = 106.85 -> floored to 106
            expect(reloaded.loyaltyPoints).toBe(Math.floor(2137 * 0.05));
        });

        it('should never throw even if the user does not exist', async () => {
            const booking = await Booking.create({
                user: new (require('mongoose').Types.ObjectId)(), court: court._id, venue: venue._id,
                startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
                endTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
                status: 'confirmed',
                pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100, currency: 'PKR' },
                payment: { amount: 2100, currency: 'PKR', status: 'completed' }
            });

            await expect(awardBookingPoints(booking)).resolves.toBeUndefined();
        });
    });

    describe('loyaltyController', () => {
        let mockReq, mockRes, mockNext;

        beforeEach(() => {
            mockReq = { body: {}, params: {}, query: {}, user: null };
            mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            mockNext = jest.fn();
        });

        it('getLoyalty should return balance and redemption value', async () => {
            user.loyaltyPoints = 100;
            mockReq.user = user;

            await getLoyalty(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: { loyaltyPoints: 100, walletValueIfRedeemed: 100 * POINTS_TO_WALLET_RATE }
            }));
        });

        it('getTransactions should paginate the ledger for the current user only', async () => {
            await User.earnLoyaltyPoints(user._id, 10, { source: 'booking_completed' });
            const other = await User.create({
                firstName: 'Other', lastName: 'User', email: 'other@example.com', password: 'Password123!'
            });
            await User.earnLoyaltyPoints(other._id, 999, { source: 'booking_completed' });

            mockReq.user = user;
            await getTransactions(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 1 }));
        });

        it('redeemPoints should credit the wallet and debit points on success', async () => {
            await User.earnLoyaltyPoints(user._id, 100, { source: 'booking_completed' });
            const funded = await User.findById(user._id);

            mockReq.user = funded;
            mockReq.body = { points: 60 };

            await redeemPoints(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);

            const reloaded = await User.findById(user._id);
            expect(reloaded.loyaltyPoints).toBe(40);
            expect(reloaded.walletBalance).toBe(60 * POINTS_TO_WALLET_RATE);
        });

        it('redeemPoints should reject a request exceeding the current balance with a 400', async () => {
            mockReq.user = user;
            mockReq.body = { points: 500 };

            await redeemPoints(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });
});
