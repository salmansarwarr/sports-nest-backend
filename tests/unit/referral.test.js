const User = require('../../src/models/User');
const Referral = require('../../src/models/Referral');
const WalletTransaction = require('../../src/models/WalletTransaction');
const Booking = require('../../src/models/Booking');
const Court = require('../../src/models/Court');
const Venue = require('../../src/models/Venue');
const { REFERRER_REWARD, REFERRED_REWARD } = require('../../src/config/referralRewards');
const { generateUniqueReferralCode, processReferralQualification } = require('../../src/utils/referral');
const {
    getMyCode,
    getReferrals,
} = require('../../src/controllers/referralController');

describe('Referral', () => {
    describe('generateUniqueReferralCode', () => {
        it('should generate a non-empty uppercase code', async () => {
            const code = await generateUniqueReferralCode();
            expect(code).toEqual(expect.any(String));
            expect(code.length).toBeGreaterThan(0);
            expect(code).toBe(code.toUpperCase());
        });

        it('should retry generation on collision until a unique code is found', async () => {
            const spy = jest.spyOn(User, 'findOne');
            spy.mockResolvedValueOnce({ _id: 'existing-collision' }).mockResolvedValueOnce(null);

            const code = await generateUniqueReferralCode();

            expect(spy).toHaveBeenCalledTimes(2);
            expect(code).toEqual(expect.any(String));

            spy.mockRestore();
        });
    });

    describe('processReferralQualification', () => {
        let referrer, referredUser, venue, court, referral;

        beforeEach(async () => {
            referrer = await User.create({
                firstName: 'Referrer', lastName: 'User', email: 'referrer@example.com',
                password: 'Password123!', referralCode: 'REFCODE1'
            });
            referredUser = await User.create({
                firstName: 'Referred', lastName: 'User', email: 'referred@example.com',
                password: 'Password123!', referredBy: referrer._id
            });
            referral = await Referral.create({
                referrer: referrer._id, referredUser: referredUser._id, referralCode: 'REFCODE1'
            });

            venue = await Venue.create({
                name: 'Test Sports Complex',
                address: { street: '123 Main St', city: 'Karachi', state: 'Sindh', country: 'Pakistan' },
                location: { type: 'Point', coordinates: [67.0011, 24.8607] },
                contact: { primaryPhone: '+923001234567', email: 'venue@example.com' },
                amenities: { totalCourts: 5 },
                owner: referrer._id
            });
            court = await Court.create({
                name: 'Test Court', venue: venue._id, sportType: 'tennis', courtType: 'outdoor',
                baseHourlyRate: 1000, owner: referrer._id
            });
        });

        const makeBooking = (overrides = {}) => Booking.create({
            user: referredUser._id, court: court._id, venue: venue._id,
            startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
            endTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
            status: 'confirmed',
            pricing: { basePrice: 2000, subtotal: 2000, totalAmount: 2100, currency: 'PKR' },
            payment: { amount: 2100, currency: 'PKR', status: 'completed' },
            ...overrides
        });

        it('should credit both wallets and mark the referral rewarded on the first paid booking', async () => {
            const booking = await makeBooking();

            await processReferralQualification(booking);

            const reloadedReferrer = await User.findById(referrer._id);
            const reloadedReferred = await User.findById(referredUser._id);
            expect(reloadedReferrer.walletBalance).toBe(REFERRER_REWARD);
            expect(reloadedReferred.walletBalance).toBe(REFERRED_REWARD);

            const reloadedReferral = await Referral.findById(referral._id);
            expect(reloadedReferral.status).toBe('rewarded');
            expect(reloadedReferral.qualifyingBooking.toString()).toBe(booking._id.toString());
            expect(reloadedReferral.rewardedAt).not.toBeNull();

            const referrerTx = await WalletTransaction.findOne({ user: referrer._id, source: 'referral_bonus' });
            expect(referrerTx.amount).toBe(REFERRER_REWARD);
        });

        it('should no-op when the paying user was never referred', async () => {
            const unreferredUser = await User.create({
                firstName: 'Nobody', lastName: 'Referred', email: 'noone@example.com', password: 'Password123!'
            });
            const booking = await makeBooking({ user: unreferredUser._id });

            await processReferralQualification(booking);

            const reloadedReferrer = await User.findById(referrer._id);
            expect(reloadedReferrer.walletBalance).toBe(0);
        });

        it('should no-op when the referral is not pending (already rewarded)', async () => {
            referral.status = 'rewarded';
            await referral.save();

            const booking = await makeBooking();
            await processReferralQualification(booking);

            const reloadedReferrer = await User.findById(referrer._id);
            expect(reloadedReferrer.walletBalance).toBe(0);
        });

        it('should no-op when this is not the referred user\'s first paid booking', async () => {
            await makeBooking(); // an earlier completed booking already exists
            const secondBooking = await makeBooking();

            await processReferralQualification(secondBooking);

            const reloadedReferrer = await User.findById(referrer._id);
            expect(reloadedReferrer.walletBalance).toBe(0);

            const reloadedReferral = await Referral.findById(referral._id);
            expect(reloadedReferral.status).toBe('pending');
        });

        it('should never throw even on unexpected internal errors', async () => {
            const booking = await makeBooking();
            booking.user = undefined; // force User.findById(undefined) inside the util

            await expect(processReferralQualification(booking)).resolves.toBeUndefined();
        });
    });

    describe('referralController', () => {
        let mockReq, mockRes, mockNext;
        let user;

        beforeEach(async () => {
            user = await User.create({
                firstName: 'Regular', lastName: 'User', email: 'user@example.com', password: 'Password123!'
            });
            mockReq = { body: {}, params: {}, query: {}, user: null };
            mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            mockNext = jest.fn();
        });

        it('getMyCode should lazily generate and persist a code if missing', async () => {
            expect(user.referralCode).toBeUndefined();
            mockReq.user = user;

            await getMyCode(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const reloaded = await User.findById(user._id);
            expect(reloaded.referralCode).toEqual(expect.any(String));
        });

        it('getMyCode should return the existing code without regenerating it', async () => {
            user.referralCode = 'EXISTING1';
            await user.save();
            mockReq.user = user;

            await getMyCode(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: { referralCode: 'EXISTING1' }
            }));
        });

        it('getReferrals should list only the current user\'s referrals sent', async () => {
            const referredUser = await User.create({
                firstName: 'Referred', lastName: 'User', email: 'referred2@example.com',
                password: 'Password123!', referredBy: user._id
            });
            await Referral.create({ referrer: user._id, referredUser: referredUser._id, referralCode: 'CODE1' });

            const other = await User.create({
                firstName: 'Other', lastName: 'Referrer', email: 'other-referrer@example.com', password: 'Password123!'
            });
            const otherReferred = await User.create({
                firstName: 'Other', lastName: 'Referred', email: 'other-referred@example.com', password: 'Password123!'
            });
            await Referral.create({ referrer: other._id, referredUser: otherReferred._id, referralCode: 'CODE2' });

            mockReq.user = user;
            await getReferrals(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 1 }));
        });
    });
});
