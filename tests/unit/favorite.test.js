const Favorite = require('../../src/models/Favorite');
const Court = require('../../src/models/Court');
const Venue = require('../../src/models/Venue');
const User = require('../../src/models/User');
const {
    addFavorite,
    getFavorites,
    removeFavorite,
} = require('../../src/controllers/favoriteController');

describe('Favorite Controller', () => {
    let mockReq, mockRes, mockNext;
    let user, owner, venue, court;

    beforeEach(async () => {
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

        venue = await Venue.create({
            name: 'Test Sports Complex',
            address: {
                street: '123 Main St',
                city: 'Karachi',
                state: 'Sindh',
                country: 'Pakistan'
            },
            location: { type: 'Point', coordinates: [67.0011, 24.8607] },
            contact: { primaryPhone: '+923001234567', email: 'venue@example.com' },
            amenities: { totalCourts: 5 },
            owner: owner._id
        });

        court = await Court.create({
            name: 'Test Court',
            venue: venue._id,
            sportType: 'tennis',
            courtType: 'outdoor',
            baseHourlyRate: 1000,
            owner: owner._id,
        });

        mockReq = { body: {}, params: {}, query: {}, user: null };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        mockNext = jest.fn();
    });

    describe('addFavorite', () => {
        it('should add a court to favorites', async () => {
            mockReq.user = user;
            mockReq.body = { itemType: 'Court', itemId: court._id.toString() };

            await addFavorite(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);

            const count = await Favorite.countDocuments({ user: user._id });
            expect(count).toBe(1);
        });

        it('should reject duplicate favorites', async () => {
            mockReq.user = user;
            mockReq.body = { itemType: 'Court', itemId: court._id.toString() };
            await addFavorite(mockReq, mockRes, mockNext);

            mockRes.status.mockClear();
            await addFavorite(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should 404 for a non-existent court', async () => {
            mockReq.user = user;
            mockReq.body = { itemType: 'Court', itemId: '507f1f77bcf86cd799439011' };

            await addFavorite(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
        });
    });

    describe('getFavorites', () => {
        it("should list the current user's favorites", async () => {
            await Favorite.create({ user: user._id, itemType: 'Court', itemId: court._id });
            await Favorite.create({ user: user._id, itemType: 'Venue', itemId: venue._id });

            mockReq.user = user;

            await getFavorites(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, count: 2 })
            );
        });
    });

    describe('removeFavorite', () => {
        it("should remove the current user's favorite", async () => {
            const favorite = await Favorite.create({ user: user._id, itemType: 'Court', itemId: court._id });

            mockReq.user = user;
            mockReq.params = { id: favorite._id.toString() };

            await removeFavorite(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(await Favorite.findById(favorite._id)).toBeNull();
        });

        it("should not allow removing another user's favorite", async () => {
            const favorite = await Favorite.create({ user: owner._id, itemType: 'Court', itemId: court._id });

            mockReq.user = user;
            mockReq.params = { id: favorite._id.toString() };

            await removeFavorite(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });
});
