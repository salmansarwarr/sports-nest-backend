const Venue = require('../../src/models/Venue');
const Court = require('../../src/models/Court');
const User = require('../../src/models/User');
const {
    createVenue,
    getVenues,
    getVenue,
    updateVenue,
    deleteVenue,
    getNearbyVenues,
    addMedia,
    deleteMedia,
    updateStatus,
    verifyVenue,
    addVerificationDocument,
    updateVerificationDocumentStatus,
    getMyVenues,
    updateVenueStats
} = require('../../src/controllers/venueController');

describe('Venue Model', () => {
    let owner;

    beforeEach(async () => {
        owner = await User.create({
            firstName: 'John',
            lastName: 'Doe',
            email: 'owner@example.com',
            password: 'Password123!',
            role: 'owner'
        });
    });

    describe('Venue Creation', () => {
        it('should create a venue with valid data', async () => {
            const venueData = {
                name: 'Sports Complex',
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
                    email: 'venue@example.com',
                    website: 'https://example.com'
                },
                amenities: {
                    totalCourts: 10,
                    parking: { available: true, capacity: 50, isFree: true },
                    wifi: { available: true, isFree: true }
                },
                owner: owner._id
            };

            const venue = await Venue.create(venueData);

            expect(venue.name).toBe(venueData.name);
            expect(venue.address.city).toBe('Karachi');
            expect(venue.location.coordinates).toEqual([67.0011, 24.8607]);
            expect(venue.status).toBe('pending-verification');
            expect(venue.slug).toBeDefined();
        });

        it('should generate unique slug from name', async () => {
            const venueData = {
                name: 'Sports Arena',
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
                    email: 'venue1@example.com'
                },
                amenities: {
                    totalCourts: 5
                },
                owner: owner._id
            };

            const venue1 = await Venue.create(venueData);

            venueData.contact.email = 'venue2@example.com';
            const venue2 = await Venue.create(venueData);

            expect(venue1.slug).toBe('sports-arena');
            expect(venue2.slug).toBe('sports-arena-1');
        });

        it('should not create venue without required fields', async () => {
            const venueData = {
                name: 'Incomplete Venue'
                // Missing address, location, contact, amenities
            };

            await expect(Venue.create(venueData)).rejects.toThrow();
        });

        it('should validate coordinates', async () => {
            const venueData = {
                name: 'Invalid Venue',
                address: {
                    street: '123 Main St',
                    city: 'Karachi',
                    state: 'Sindh',
                    country: 'Pakistan'
                },
                location: {
                    type: 'Point',
                    coordinates: [200, 100] // Invalid coordinates
                },
                contact: {
                    primaryPhone: '+923001234567',
                    email: 'venue@example.com'
                },
                amenities: {
                    totalCourts: 5
                },
                owner: owner._id
            };

            await expect(Venue.create(venueData)).rejects.toThrow();
        });
    });

    describe('Venue Methods', () => {
        let venue;

        beforeEach(async () => {
            venue = await Venue.create({
                name: 'Test Venue',
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
                owner: owner._id
            });
        });

        it('should have virtual for full address', () => {
            const fullAddress = venue.fullAddress;
            expect(fullAddress).toContain('123 Main St');
            expect(fullAddress).toContain('Karachi');
            expect(fullAddress).toContain('Sindh');
            expect(fullAddress).toContain('Pakistan');
        });

        it('should update venue statistics', async () => {
            // Create courts for the venue
            await Court.create([
                {
                    name: 'Court 1',
                    venue: venue._id,
                    sportType: 'tennis',
                    courtType: 'outdoor',
                    baseHourlyRate: 1000,
                    owner: owner._id,
                    stats: { averageRating: 4.5, totalBookings: 10, totalRevenue: 10000 }
                },
                {
                    name: 'Court 2',
                    venue: venue._id,
                    sportType: 'badminton',
                    courtType: 'indoor',
                    baseHourlyRate: 800,
                    owner: owner._id,
                    stats: { averageRating: 4.0, totalBookings: 5, totalRevenue: 4000 }
                }
            ]);

            await venue.updateStats();

            expect(venue.stats.totalCourts).toBe(2);
            expect(venue.stats.averageRating).toBe(4.25); // (4.5 + 4.0) / 2
            expect(venue.stats.totalBookings).toBe(15);
            expect(venue.stats.totalRevenue).toBe(14000);
        });
    });

    describe('Venue Static Methods', () => {
        beforeEach(async () => {
            // Create multiple venues
            await Venue.create([
                {
                    name: 'Venue A',
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
                        email: 'venuea@example.com'
                    },
                    amenities: { totalCourts: 5 },
                    owner: owner._id,
                    status: 'active'
                },
                {
                    name: 'Venue B',
                    address: {
                        street: '456 Second St',
                        city: 'Lahore',
                        state: 'Punjab',
                        country: 'Pakistan'
                    },
                    location: {
                        type: 'Point',
                        coordinates: [74.3587, 31.5204]
                    },
                    contact: {
                        primaryPhone: '+923001234568',
                        email: 'venueb@example.com'
                    },
                    amenities: { totalCourts: 8 },
                    owner: owner._id,
                    status: 'active'
                }
            ]);
        });

        it('should find nearby venues', async () => {
            const nearbyVenues = await Venue.findNearby(67.0011, 24.8607, 10000, 10);

            expect(nearbyVenues.length).toBeGreaterThan(0);
            expect(nearbyVenues[0].name).toBe('Venue A');
        });

        it('should search venues by city', async () => {
            const venues = await Venue.searchVenues({ city: 'Karachi', status: 'active' });

            expect(venues.length).toBeGreaterThan(0);
            expect(venues[0].address.city).toBe('Karachi');
        });
    });
});

describe('Venue Controller', () => {
    let mockReq, mockRes, mockNext;
    let owner, admin, regularUser, venue;

    beforeEach(async () => {
        // Create users
        owner = await User.create({
            firstName: 'Owner',
            lastName: 'User',
            email: 'owner@example.com',
            password: 'Password123!',
            role: 'owner'
        });

        admin = await User.create({
            firstName: 'Admin',
            lastName: 'User',
            email: 'admin@example.com',
            password: 'Password123!',
            role: 'admin'
        });

        regularUser = await User.create({
            firstName: 'Regular',
            lastName: 'User',
            email: 'user@example.com',
            password: 'Password123!'
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
            status: 'active'
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

    describe('createVenue', () => {
        it('should create venue successfully', async () => {
            mockReq.user = owner;
            mockReq.body = {
                name: 'New Sports Complex',
                address: {
                    street: '456 Second St',
                    city: 'Lahore',
                    state: 'Punjab',
                    country: 'Pakistan'
                },
                location: {
                    type: 'Point',
                    coordinates: [74.3587, 31.5204]
                },
                contact: {
                    primaryPhone: '+923001234568',
                    email: 'newvenue@example.com'
                },
                amenities: {
                    totalCourts: 8
                }
            };

            await createVenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Venue created successfully',
                    data: expect.objectContaining({
                        name: 'New Sports Complex'
                    })
                })
            );
        });

        it('should set owner from authenticated user', async () => {
            mockReq.user = owner;
            mockReq.body = {
                name: 'New Venue',
                address: {
                    street: '789 Third St',
                    city: 'Islamabad',
                    state: 'ICT',
                    country: 'Pakistan'
                },
                location: {
                    type: 'Point',
                    coordinates: [73.0479, 33.6844]
                },
                contact: {
                    primaryPhone: '+923001234569',
                    email: 'another@example.com'
                },
                amenities: {
                    totalCourts: 3
                }
            };

            await createVenue(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.owner.toString()).toBe(owner._id.toString());
        });
    });

    describe('getVenues', () => {
        beforeEach(async () => {
            // Create additional venues
            await Venue.create([
                {
                    name: 'Venue 2',
                    address: {
                        street: '456 Second St',
                        city: 'Lahore',
                        state: 'Punjab',
                        country: 'Pakistan'
                    },
                    location: {
                        type: 'Point',
                        coordinates: [74.3587, 31.5204]
                    },
                    contact: {
                        primaryPhone: '+923001234568',
                        email: 'venue2@example.com'
                    },
                    amenities: { totalCourts: 8 },
                    owner: owner._id,
                    status: 'active'
                }
            ]);
        });

        it('should get all active venues', async () => {
            mockReq.query = {};

            await getVenues(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: expect.any(Number),
                    data: expect.any(Array)
                })
            );
        });

        it('should filter venues by city', async () => {
            mockReq.query = { city: 'Karachi' };

            await getVenues(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.every(v => v.address.city === 'Karachi')).toBe(true);
        });

        it('should support pagination', async () => {
            mockReq.query = { page: 1, limit: 1 };

            await getVenues(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.count).toBeLessThanOrEqual(1);
            expect(response.totalPages).toBeGreaterThanOrEqual(1);
        });
    });

    describe('getVenue', () => {
        it('should get venue by ID', async () => {
            mockReq.params = { id: venue._id.toString() };

            await getVenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        name: 'Test Sports Complex'
                    })
                })
            );
        });

        it('should get venue by slug', async () => {
            mockReq.params = { id: venue.slug };

            await getVenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        name: 'Test Sports Complex'
                    })
                })
            );
        });

        it('should return 404 for non-existent venue', async () => {
            mockReq.params = { id: '507f1f77bcf86cd799439011' };

            await getVenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Venue not found'
                })
            );
        });
    });

    describe('updateVenue', () => {
        it('should update venue as owner', async () => {
            mockReq.user = owner;
            mockReq.params = { id: venue._id.toString() };
            mockReq.body = {
                name: 'Updated Sports Complex',
                description: 'A premium sports facility'
            };

            await updateVenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Venue updated successfully',
                    data: expect.objectContaining({
                        name: 'Updated Sports Complex'
                    })
                })
            );
        });

        it('should not update venue as unauthorized user', async () => {
            mockReq.user = regularUser;
            mockReq.params = { id: venue._id.toString() };
            mockReq.body = { name: 'Hacked Name' };

            await updateVenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('deleteVenue', () => {
        it('should delete venue without courts', async () => {
            mockReq.user = owner;
            mockReq.params = { id: venue._id.toString() };

            await deleteVenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Venue deleted successfully'
                })
            );

            const deletedVenue = await Venue.findById(venue._id);
            expect(deletedVenue).toBeNull();
        });

        it('should not delete venue with courts', async () => {
            // Create a court for the venue
            await Court.create({
                name: 'Court 1',
                venue: venue._id,
                sportType: 'tennis',
                courtType: 'outdoor',
                baseHourlyRate: 1000,
                owner: owner._id
            });

            mockReq.user = owner;
            mockReq.params = { id: venue._id.toString() };

            await deleteVenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('associated court')
                })
            );
        });
    });

    describe('getNearbyVenues', () => {
        it('should find nearby venues', async () => {
            mockReq.query = {
                latitude: 24.8607,
                longitude: 67.0011,
                maxDistance: 10000
            };

            await getNearbyVenues(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.any(Array)
                })
            );
        });

        it('should require latitude and longitude', async () => {
            mockReq.query = {};

            await getNearbyVenues(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Latitude and longitude')
                })
            );
        });
    });

    describe('addMedia', () => {
        it('should add media to venue', async () => {
            mockReq.user = owner;
            mockReq.params = { id: venue._id.toString() };
            mockReq.body = {
                type: 'image',
                url: 'https://example.com/venue.jpg',
                altText: 'Venue image',
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

            const updatedVenue = await Venue.findById(venue._id);
            expect(updatedVenue.media).toHaveLength(1);
            expect(updatedVenue.media[0].isPrimary).toBe(true);
        });
    });

    describe('updateStatus', () => {
        it('should update venue status as owner', async () => {
            mockReq.user = owner;
            mockReq.params = { id: venue._id.toString() };
            mockReq.body = { status: 'inactive' };

            await updateStatus(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Venue status updated successfully'
                })
            );

            const updatedVenue = await Venue.findById(venue._id);
            expect(updatedVenue.status).toBe('inactive');
        });
    });

    describe('verifyVenue', () => {
        it('should verify venue as admin', async () => {
            mockReq.user = admin;
            mockReq.params = { id: venue._id.toString() };

            await verifyVenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Venue verified successfully'
                })
            );

            const verifiedVenue = await Venue.findById(venue._id);
            expect(verifiedVenue.verification.isVerified).toBe(true);
            expect(verifiedVenue.status).toBe('active');
        });

        it('should not verify venue as non-admin', async () => {
            mockReq.user = owner;
            mockReq.params = { id: venue._id.toString() };

            await verifyVenue(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Only admins can verify venues'
                })
            );
        });
    });

    describe('getMyVenues', () => {
        it('should get venues owned by user', async () => {
            mockReq.user = owner;
            mockReq.query = {};

            await getMyVenues(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.any(Array)
                })
            );

            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.length).toBeGreaterThan(0);
        });
    });

    describe('updateVenueStats', () => {
        it('should update venue statistics', async () => {
            // Create courts for the venue
            await Court.create([
                {
                    name: 'Court 1',
                    venue: venue._id,
                    sportType: 'tennis',
                    courtType: 'outdoor',
                    baseHourlyRate: 1000,
                    owner: owner._id,
                    stats: { averageRating: 4.5, totalBookings: 10, totalRevenue: 10000 }
                }
            ]);

            mockReq.user = owner;
            mockReq.params = { id: venue._id.toString() };

            await updateVenueStats(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Venue statistics updated successfully',
                    data: expect.objectContaining({
                        totalCourts: 1
                    })
                })
            );
        });
    });
});
