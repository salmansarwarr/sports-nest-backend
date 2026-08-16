const Court = require('../../src/models/Court');
const Venue = require('../../src/models/Venue');
const User = require('../../src/models/User');
const {
    createCourt,
    getCourts,
    getRecommendedCourts,
    compareCourts,
    getCourt,
    updateCourt,
    deleteCourt,
    addMedia,
    deleteMedia,
    addPricingRule,
    updatePricingRule,
    deletePricingRule,
    addAvailabilityException,
    deleteAvailabilityException,
    calculatePrice,
    checkAvailability,
    updateStatus,
    getCourtsByVenue
} = require('../../src/controllers/courtController');

describe('Court Model', () => {
    let venue, owner;

    beforeEach(async () => {
        // Create owner user
        owner = await User.create({
            firstName: 'John',
            lastName: 'Doe',
            email: 'owner@example.com',
            password: 'Password123!',
            role: 'owner'
        });

        // Create venue
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
            owner: owner._id
        });
    });

    describe('Court Creation', () => {
        it('should create a court with valid data', async () => {
            const courtData = {
                name: 'Court 1',
                venue: venue._id,
                sportType: 'tennis',
                courtType: 'outdoor',
                baseHourlyRate: 1000,
                owner: owner._id
            };

            const court = await Court.create(courtData);

            expect(court.name).toBe(courtData.name);
            expect(court.sportType).toBe(courtData.sportType);
            expect(court.baseHourlyRate).toBe(courtData.baseHourlyRate);
            expect(court.status).toBe('active');
            expect(court.slug).toBeDefined();
        });

        it('should generate unique slug from name', async () => {
            const court1 = await Court.create({
                name: 'Tennis Court',
                venue: venue._id,
                sportType: 'tennis',
                courtType: 'outdoor',
                baseHourlyRate: 1000,
                owner: owner._id
            });

            const court2 = await Court.create({
                name: 'Tennis Court',
                venue: venue._id,
                sportType: 'tennis',
                courtType: 'outdoor',
                baseHourlyRate: 1000,
                owner: owner._id
            });

            expect(court1.slug).toBe('tennis-court');
            expect(court2.slug).toBe('tennis-court-1');
        });

        it('should not create court without required fields', async () => {
            const courtData = {
                name: 'Court 1',
                // Missing venue, sportType, courtType, baseHourlyRate
            };

            await expect(Court.create(courtData)).rejects.toThrow();
        });
    });

    describe('Court Methods', () => {
        let court;

        beforeEach(async () => {
            court = await Court.create({
                name: 'Test Court',
                venue: venue._id,
                sportType: 'tennis',
                courtType: 'outdoor',
                baseHourlyRate: 1000,
                owner: owner._id,
                operatingHours: [
                    { dayOfWeek: 1, openTime: '08:00', closeTime: '20:00', isClosed: false },
                    { dayOfWeek: 2, openTime: '08:00', closeTime: '20:00', isClosed: false }
                ],
                pricingRules: [
                    {
                        name: 'Peak Hours',
                        type: 'peak',
                        baseRate: 1500,
                        startTime: '17:00',
                        endTime: '21:00',
                        priority: 10,
                        isActive: true
                    }
                ]
            });
        });

        it('should calculate price for time slot', () => {
            const startTime = new Date('2024-01-15T10:00:00');
            const endTime = new Date('2024-01-15T12:00:00');

            const price = court.calculatePrice(startTime, endTime);

            expect(price).toBe(2000); // 2 hours * 1000
        });

        it('should apply pricing rule for peak hours', () => {
            const startTime = new Date('2024-01-15T18:00:00');
            const endTime = new Date('2024-01-15T20:00:00');

            const price = court.calculatePrice(startTime, endTime);

            expect(price).toBe(3000); // 2 hours * 1500 (peak rate)
        });

        it('should check availability for time slot', async () => {
            const startTime = new Date('2024-01-15T10:00:00');
            const endTime = new Date('2024-01-15T12:00:00');

            const availability = await court.isAvailableForSlot(startTime, endTime);

            expect(availability.available).toBe(true);
        });

        it('should return unavailable for inactive court', async () => {
            court.status = 'inactive';
            await court.save();

            const startTime = new Date('2024-01-15T10:00:00');
            const endTime = new Date('2024-01-15T12:00:00');

            const availability = await court.isAvailableForSlot(startTime, endTime);

            expect(availability.available).toBe(false);
            expect(availability.reason).toContain('not active');
        });
    });
});

describe('Court Controller', () => {
    let mockReq, mockRes, mockNext;
    let owner, manager, venue, court;

    beforeEach(async () => {
        // Create users
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
            owner: owner._id
        });

        // Setup mock objects
        mockReq = {
            body: {},
            params: {},
            query: {},
            user: null
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        mockNext = jest.fn();
    });

    describe('createCourt', () => {
        it('should create court successfully as venue owner', async () => {
            mockReq.user = owner;
            mockReq.body = {
                name: 'New Court',
                venue: venue._id.toString(),
                sportType: 'badminton',
                courtType: 'indoor',
                baseHourlyRate: 800
            };

            await createCourt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Court created successfully',
                    data: expect.objectContaining({
                        name: 'New Court',
                        sportType: 'badminton'
                    })
                })
            );

            // A court with no operating hours can never have any bookable
            // slots, so creation must default to a real 7-day schedule.
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.operatingHours).toHaveLength(7);
            expect(response.data.operatingHours[0]).toEqual(
                expect.objectContaining({ dayOfWeek: 0, openTime: '08:00', closeTime: '22:00', isClosed: false }),
            );
        });

        it('should respect explicit operating hours when provided', async () => {
            mockReq.user = owner;
            mockReq.body = {
                name: 'Custom Hours Court',
                venue: venue._id.toString(),
                sportType: 'badminton',
                courtType: 'indoor',
                baseHourlyRate: 800,
                operatingHours: [
                    { dayOfWeek: 1, openTime: '10:00', closeTime: '18:00', isClosed: false }
                ]
            };

            await createCourt(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.operatingHours).toHaveLength(1);
            expect(response.data.operatingHours[0].openTime).toBe('10:00');
        });

        it('should not create court for non-existent venue', async () => {
            mockReq.user = owner;
            mockReq.body = {
                name: 'New Court',
                venue: '507f1f77bcf86cd799439011',
                sportType: 'badminton',
                courtType: 'indoor',
                baseHourlyRate: 800
            };

            await createCourt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Venue not found'
                })
            );
        });

        it('should not create court if user is not authorized', async () => {
            const unauthorizedUser = await User.create({
                firstName: 'Unauthorized',
                lastName: 'User',
                email: 'unauthorized@example.com',
                password: 'Password123!'
            });

            mockReq.user = unauthorizedUser;
            mockReq.body = {
                name: 'New Court',
                venue: venue._id.toString(),
                sportType: 'badminton',
                courtType: 'indoor',
                baseHourlyRate: 800
            };

            await createCourt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Not authorized')
                })
            );
        });
    });

    describe('getCourts', () => {
        beforeEach(async () => {
            // Create multiple courts
            await Court.create([
                {
                    name: 'Tennis Court 1',
                    venue: venue._id,
                    sportType: 'tennis',
                    courtType: 'outdoor',
                    baseHourlyRate: 1000,
                    owner: owner._id
                },
                {
                    name: 'Badminton Court 1',
                    venue: venue._id,
                    sportType: 'badminton',
                    courtType: 'indoor',
                    baseHourlyRate: 800,
                    owner: owner._id
                }
            ]);
        });

        it('should get all active courts', async () => {
            mockReq.query = {};

            await getCourts(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: expect.any(Number),
                    data: expect.any(Array)
                })
            );
        });

        it('should filter courts by sport type', async () => {
            mockReq.query = { sportType: 'tennis' };

            await getCourts(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.every(c => c.sportType === 'tennis')).toBe(true);
        });

        it('should filter courts by venue', async () => {
            mockReq.query = { venue: venue._id.toString() };

            await getCourts(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.every(c => c.venue._id.toString() === venue._id.toString())).toBe(true);
        });
    });

    describe('getRecommendedCourts', () => {
        beforeEach(async () => {
            // `court` (outer fixture) is plain/unfeatured/unrated - low score
            await Court.create({
                name: 'Featured High-Rated Court',
                venue: venue._id,
                sportType: 'tennis',
                courtType: 'outdoor',
                baseHourlyRate: 1000,
                owner: owner._id,
                isFeatured: true,
                stats: { averageRating: 4.8, totalReviews: 20 }
            });
        });

        it('should rank featured/highly-rated courts above plain ones', async () => {
            mockReq.query = {};

            await getRecommendedCourts(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.length).toBeGreaterThan(0);
            expect(response.data[0].name).toBe('Featured High-Rated Court');
        });

        it('should respect the limit query param', async () => {
            mockReq.query = { limit: '1' };

            await getRecommendedCourts(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.length).toBe(1);
        });

        it('should scope to nearby venues when coordinates are given', async () => {
            mockReq.query = { latitude: '24.8607', longitude: '67.0011' };

            await getRecommendedCourts(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.length).toBeGreaterThan(0);
        });

        it('should fall back to the global query when no venues are nearby', async () => {
            // North Pole - nothing is within 15km of this
            mockReq.query = { latitude: '89.9', longitude: '0' };

            await getRecommendedCourts(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.length).toBeGreaterThan(0);
        });
    });

    describe('compareCourts', () => {
        let secondCourt, inactiveCourt;

        beforeEach(async () => {
            secondCourt = await Court.create({
                name: 'Badminton Court', venue: venue._id, sportType: 'badminton', courtType: 'indoor',
                baseHourlyRate: 800, owner: owner._id
            });
            inactiveCourt = await Court.create({
                name: 'Closed Court', venue: venue._id, sportType: 'tennis', courtType: 'outdoor',
                baseHourlyRate: 900, owner: owner._id, status: 'inactive'
            });
        });

        it('should return the requested courts side-by-side', async () => {
            mockReq.query = { ids: `${court._id},${secondCourt._id}` };

            await compareCourts(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.success).toBe(true);
            expect(response.count).toBe(2);
            const ids = response.data.map(c => c._id.toString());
            expect(ids).toEqual(expect.arrayContaining([court._id.toString(), secondCourt._id.toString()]));
        });

        it('should silently exclude inactive courts from the requested ids', async () => {
            mockReq.query = { ids: `${court._id},${inactiveCourt._id}` };

            await compareCourts(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.count).toBe(1);
            expect(response.data[0]._id.toString()).toBe(court._id.toString());
        });

        it('should propagate an internal error via next() rather than throwing when ids is missing', async () => {
            mockReq.query = {};

            await compareCourts(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('getCourt', () => {
        it('should get court by ID', async () => {
            mockReq.params = { id: court._id.toString() };

            await getCourt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        name: 'Test Court'
                    })
                })
            );
        });

        it('should get court by slug', async () => {
            mockReq.params = { id: court.slug };

            await getCourt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        name: 'Test Court'
                    })
                })
            );
        });

        it('should return 404 for non-existent court', async () => {
            mockReq.params = { id: '507f1f77bcf86cd799439011' };

            await getCourt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Court not found'
                })
            );
        });
    });

    describe('updateCourt', () => {
        it('should update court as owner', async () => {
            mockReq.user = owner;
            mockReq.params = { id: court._id.toString() };
            mockReq.body = {
                name: 'Updated Court Name',
                baseHourlyRate: 1200
            };

            await updateCourt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Court updated successfully',
                    data: expect.objectContaining({
                        name: 'Updated Court Name',
                        baseHourlyRate: 1200
                    })
                })
            );
        });

        it('should not update court as unauthorized user', async () => {
            const unauthorizedUser = await User.create({
                firstName: 'Unauthorized',
                lastName: 'User',
                email: 'unauthorized@example.com',
                password: 'Password123!'
            });

            mockReq.user = unauthorizedUser;
            mockReq.params = { id: court._id.toString() };
            mockReq.body = { name: 'Hacked Name' };

            await updateCourt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('deleteCourt', () => {
        it('should delete court as owner', async () => {
            mockReq.user = owner;
            mockReq.params = { id: court._id.toString() };

            await deleteCourt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Court deleted successfully'
                })
            );

            const deletedCourt = await Court.findById(court._id);
            expect(deletedCourt).toBeNull();
        });

        it('should not delete court as unauthorized user', async () => {
            const unauthorizedUser = await User.create({
                firstName: 'Unauthorized',
                lastName: 'User',
                email: 'unauthorized@example.com',
                password: 'Password123!'
            });

            mockReq.user = unauthorizedUser;
            mockReq.params = { id: court._id.toString() };

            await deleteCourt(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('addMedia', () => {
        it('should add media to court', async () => {
            mockReq.user = owner;
            mockReq.params = { id: court._id.toString() };
            mockReq.body = {
                type: 'image',
                url: 'https://example.com/court.jpg',
                altText: 'Court image',
                isPrimary: true
            };

            await addMedia(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Media added successfully'
                })
            );

            const updatedCourt = await Court.findById(court._id);
            expect(updatedCourt.media).toHaveLength(1);
            expect(updatedCourt.media[0].isPrimary).toBe(true);
        });
    });

    describe('addPricingRule', () => {
        it('should add pricing rule to court', async () => {
            mockReq.user = owner;
            mockReq.params = { id: court._id.toString() };
            mockReq.body = {
                name: 'Weekend Rate',
                type: 'weekend',
                baseRate: 1500,
                daysOfWeek: [0, 6],
                priority: 5,
                isActive: true
            };

            await addPricingRule(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Pricing rule added successfully'
                })
            );

            const updatedCourt = await Court.findById(court._id);
            expect(updatedCourt.pricingRules).toHaveLength(1);
        });
    });

    describe('calculatePrice', () => {
        it('should calculate price for time slot', async () => {
            mockReq.params = { id: court._id.toString() };
            mockReq.body = {
                startTime: '2024-01-15T10:00:00Z',
                endTime: '2024-01-15T12:00:00Z'
            };

            await calculatePrice(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        totalPrice: expect.any(Number),
                        baseRate: 1000,
                        duration: 120
                    })
                })
            );

            // Regression guard: the breakdown fields the frontend's price
            // quote UI actually renders must be real numbers, never NaN/undefined.
            const response = mockRes.json.mock.calls[0][0];
            const { data } = response;
            expect(data.baseAmount).toBe(2000); // 1000/hr * 2 hours, no pricing rule applies
            expect(data.peakAdjustment).toBe(0);
            expect(data.groupAdjustment).toBe(0);
            expect(data.subtotal).toBe(2000);
            expect(data.taxes).toBe(100); // 5% of 2000
            expect(data.totalAmount).toBe(2100);
            expect(Number.isNaN(data.totalAmount)).toBe(false);
            expect(Array.isArray(data.breakdown)).toBe(true);
        });
    });

    describe('checkAvailability', () => {
        it('should check availability for time slot', async () => {
            mockReq.params = { id: court._id.toString() };
            mockReq.body = {
                startTime: '2024-01-15T10:00:00Z',
                endTime: '2024-01-15T12:00:00Z'
            };

            await checkAvailability(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        available: expect.any(Boolean)
                    })
                })
            );
        });
    });

    describe('updateStatus', () => {
        it('should update court status', async () => {
            mockReq.user = owner;
            mockReq.params = { id: court._id.toString() };
            mockReq.body = {
                status: 'maintenance',
                reason: 'Scheduled maintenance'
            };

            await updateStatus(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Court status updated successfully'
                })
            );

            const updatedCourt = await Court.findById(court._id);
            expect(updatedCourt.status).toBe('maintenance');
        });
    });
});
