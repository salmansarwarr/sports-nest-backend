const Review = require('../../src/models/Review');
const Booking = require('../../src/models/Booking');
const Court = require('../../src/models/Court');
const Venue = require('../../src/models/Venue');
const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const {
    createReview,
    getReviews,
    getReview,
    updateReview,
    deleteReview,
    replyToReview,
    reportReview,
    moderateReview,
} = require('../../src/controllers/reviewController');

describe('Review Controller', () => {
    let mockReq, mockRes, mockNext;
    let user, owner, venue, court, completedBooking;

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
            location: {
                type: 'Point',
                coordinates: [67.0011, 24.8607]
            },
            contact: {
                primaryPhone: '+923001234567',
                email: 'venue@example.com'
            },
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

        completedBooking = await Booking.create({
            user: user._id,
            court: court._id,
            venue: venue._id,
            startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
            endTime: new Date(Date.now() - 60 * 60 * 1000),
            status: 'completed',
            pricing: { basePrice: 1000, subtotal: 1000, totalAmount: 1050 },
            payment: { amount: 1050, currency: 'PKR', status: 'completed' }
        });

        mockReq = { body: {}, params: {}, query: {}, user: null };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        mockNext = jest.fn();
    });

    describe('createReview', () => {
        it('should create a review for a completed booking', async () => {
            mockReq.user = user;
            mockReq.body = { booking: completedBooking._id.toString(), rating: 5, comment: 'Great court!' };

            await createReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({ rating: 5 })
                })
            );

            const updatedBooking = await Booking.findById(completedBooking._id);
            expect(updatedBooking.isReviewed).toBe(true);
            expect(updatedBooking.rating).toBe(5);

            const updatedCourt = await Court.findById(court._id);
            expect(updatedCourt.stats.averageRating).toBe(5);
            expect(updatedCourt.stats.totalReviews).toBe(1);
        });

        it('should create a review for a cancelled booking', async () => {
            const cancelledBooking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
                endTime: new Date(Date.now() - 60 * 60 * 1000),
                status: 'cancelled',
                pricing: { basePrice: 1000, subtotal: 1000, totalAmount: 1050 },
                payment: { amount: 1050, currency: 'PKR', status: 'refunded' }
            });

            mockReq.user = user;
            mockReq.body = { booking: cancelledBooking._id.toString(), rating: 3, comment: 'Had to cancel, but staff were helpful.' };

            await createReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);

            const updatedBooking = await Booking.findById(cancelledBooking._id);
            expect(updatedBooking.isReviewed).toBe(true);
        });

        it('should reject review for a non-completed, non-cancelled booking', async () => {
            const pendingBooking = await Booking.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
                endTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
                status: 'confirmed',
                pricing: { basePrice: 1000, subtotal: 1000, totalAmount: 1050 },
                payment: { amount: 1050, currency: 'PKR', status: 'pending' }
            });

            mockReq.user = user;
            mockReq.body = { booking: pendingBooking._id.toString(), rating: 4 };

            await createReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should reject a duplicate review for the same booking', async () => {
            mockReq.user = user;
            mockReq.body = { booking: completedBooking._id.toString(), rating: 5 };
            await createReview(mockReq, mockRes, mockNext);

            mockRes.status.mockClear();
            mockRes.json.mockClear();

            await createReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should reject review from a user who does not own the booking', async () => {
            const otherUser = await User.create({
                firstName: 'Other',
                lastName: 'User',
                email: 'other@example.com',
                password: 'Password123!'
            });

            mockReq.user = otherUser;
            mockReq.body = { booking: completedBooking._id.toString(), rating: 3 };

            await createReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('getReviews / getReview', () => {
        let review;

        beforeEach(async () => {
            review = await Review.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                booking: completedBooking._id,
                rating: 4,
                comment: 'Solid'
            });
        });

        it('should list approved reviews for a court', async () => {
            mockReq.query = { court: court._id.toString() };

            await getReviews(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, count: 1 })
            );
        });

        it('should get a single review by ID', async () => {
            mockReq.params = { id: review._id.toString() };

            await getReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({ rating: 4 })
                })
            );
        });

        it('should let an admin see reviews of every status when no status filter is given', async () => {
            const admin = await User.create({
                firstName: 'Admin3', lastName: 'User', email: 'admin3@example.com', password: 'Password123!', role: 'admin'
            });
            await Review.findByIdAndUpdate(review._id, { status: 'rejected' });

            mockReq.user = admin;
            mockReq.query = { court: court._id.toString() };

            await getReviews(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.count).toBe(1); // the rejected review is included for admins
        });

        it('should let an admin filter to only reported reviews', async () => {
            await Review.findByIdAndUpdate(review._id, {
                report: { isReported: true, reason: 'Offensive', reportedBy: owner._id, reportedAt: new Date() }
            });
            const otherReview = await Review.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                booking: await Booking.create({
                    user: user._id,
                    court: court._id,
                    venue: venue._id,
                    startTime: new Date(Date.now() - 4 * 60 * 60 * 1000),
                    endTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
                    status: 'completed',
                    pricing: { basePrice: 1000, subtotal: 1000, totalAmount: 1050 },
                    payment: { amount: 1050, currency: 'PKR', status: 'completed' }
                }).then(b => b._id),
                rating: 5,
                comment: 'Not reported'
            });

            const admin = await User.create({
                firstName: 'Admin4', lastName: 'User', email: 'admin4@example.com', password: 'Password123!', role: 'admin'
            });

            mockReq.user = admin;
            mockReq.query = { reported: 'true' };

            await getReviews(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.count).toBe(1);
            expect(response.data[0]._id.toString()).toBe(review._id.toString());
            expect(response.data.some(r => r._id.toString() === otherReview._id.toString())).toBe(false);
        });

        it('should not let a non-admin filter to reported reviews', async () => {
            await Review.findByIdAndUpdate(review._id, {
                report: { isReported: true, reason: 'Offensive', reportedBy: owner._id, reportedAt: new Date() }
            });

            mockReq.user = user;
            mockReq.query = { reported: 'true' };

            await getReviews(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.count).toBe(1); // falls back to status:'approved' scoping, reported flag ignored
        });
    });

    describe('updateReview', () => {
        let review;

        beforeEach(async () => {
            review = await Review.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                booking: completedBooking._id,
                rating: 3,
            });
            await Review.recalculateCourtStats(court._id);
        });

        it('should allow the author to update their review', async () => {
            mockReq.user = user;
            mockReq.params = { id: review._id.toString() };
            mockReq.body = { rating: 5, comment: 'Actually amazing' };

            await updateReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);

            const updatedCourt = await Court.findById(court._id);
            expect(updatedCourt.stats.averageRating).toBe(5);
        });

        it('should not allow another user to update the review', async () => {
            const otherUser = await User.create({
                firstName: 'Other',
                lastName: 'User',
                email: 'other2@example.com',
                password: 'Password123!'
            });

            mockReq.user = otherUser;
            mockReq.params = { id: review._id.toString() };
            mockReq.body = { rating: 1 };

            await updateReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('deleteReview', () => {
        let review;

        beforeEach(async () => {
            review = await Review.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                booking: completedBooking._id,
                rating: 4,
            });
            completedBooking.review = review._id;
            completedBooking.rating = 4;
            completedBooking.isReviewed = true;
            await completedBooking.save();
            await Review.recalculateCourtStats(court._id);
        });

        it('should allow the author to delete their review and reset booking state', async () => {
            mockReq.user = user;
            mockReq.params = { id: review._id.toString() };

            await deleteReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);

            const updatedBooking = await Booking.findById(completedBooking._id);
            expect(updatedBooking.isReviewed).toBe(false);

            const updatedCourt = await Court.findById(court._id);
            expect(updatedCourt.stats.totalReviews).toBe(0);
        });
    });

    describe('replyToReview', () => {
        let review;

        beforeEach(async () => {
            review = await Review.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                booking: completedBooking._id,
                rating: 4,
            });
        });

        it('should allow the court owner to reply', async () => {
            mockReq.user = owner;
            mockReq.params = { id: review._id.toString() };
            mockReq.body = { text: 'Thanks for the feedback!' };

            await replyToReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        ownerReply: expect.objectContaining({ text: 'Thanks for the feedback!' })
                    })
                })
            );
        });

        it('should not allow an unrelated user to reply', async () => {
            const stranger = await User.create({
                firstName: 'Stranger',
                lastName: 'Danger',
                email: 'stranger@example.com',
                password: 'Password123!'
            });

            mockReq.user = stranger;
            mockReq.params = { id: review._id.toString() };
            mockReq.body = { text: 'Not my business' };

            await replyToReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('reportReview', () => {
        let review;

        beforeEach(async () => {
            review = await Review.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                booking: completedBooking._id,
                rating: 1,
                comment: 'This place is terrible and the staff are awful people'
            });
        });

        it('should allow the court owner to report a review', async () => {
            mockReq.user = owner;
            mockReq.params = { id: review._id.toString() };
            mockReq.body = { reason: 'Contains personal attacks on staff' };

            await reportReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);

            const updated = await Review.findById(review._id);
            expect(updated.report.isReported).toBe(true);
            expect(updated.report.reason).toBe('Contains personal attacks on staff');
            expect(updated.report.reportedBy.toString()).toBe(owner._id.toString());

            const auditEntry = await AuditLog.findOne({ action: 'review.reported', resourceId: review._id });
            expect(auditEntry).not.toBeNull();
        });

        it('should allow a venue manager to report a review', async () => {
            const manager = await User.create({
                firstName: 'Venue', lastName: 'Manager', email: 'reviewmanager@example.com',
                password: 'Password123!', role: 'manager'
            });
            await Venue.findByIdAndUpdate(venue._id, { $push: { managers: manager._id } });

            mockReq.user = manager;
            mockReq.params = { id: review._id.toString() };
            mockReq.body = { reason: 'Offensive language' };

            await reportReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should not allow an unrelated user to report a review', async () => {
            const stranger = await User.create({
                firstName: 'Stranger', lastName: 'Danger', email: 'reportstranger@example.com', password: 'Password123!'
            });

            mockReq.user = stranger;
            mockReq.params = { id: review._id.toString() };
            mockReq.body = { reason: 'I just do not like it' };

            await reportReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('moderateReview', () => {
        let review;

        beforeEach(async () => {
            review = await Review.create({
                user: user._id,
                court: court._id,
                venue: venue._id,
                booking: completedBooking._id,
                rating: 1,
            });
            await Review.recalculateCourtStats(court._id);
        });

        it('should allow an admin to reject a review and recalculate stats', async () => {
            const admin = await User.create({
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com',
                password: 'Password123!',
                role: 'admin'
            });

            mockReq.user = admin;
            mockReq.params = { id: review._id.toString() };
            mockReq.body = { status: 'rejected', moderationReason: 'Spam' };

            await moderateReview(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);

            const updatedCourt = await Court.findById(court._id);
            expect(updatedCourt.stats.totalReviews).toBe(0);

            const auditEntry = await AuditLog.findOne({ action: 'review.moderated', resourceId: review._id });
            expect(auditEntry).not.toBeNull();
        });

        it('should resolve a pending report when an admin moderates the review', async () => {
            review.report = { isReported: true, reason: 'Abusive', reportedBy: owner._id, reportedAt: new Date() };
            await review.save();

            const admin = await User.create({
                firstName: 'Admin2', lastName: 'User', email: 'admin2@example.com', password: 'Password123!', role: 'admin'
            });

            mockReq.user = admin;
            mockReq.params = { id: review._id.toString() };
            mockReq.body = { status: 'rejected', moderationReason: 'Confirmed abusive' };

            await moderateReview(mockReq, mockRes, mockNext);

            const updated = await Review.findById(review._id);
            expect(updated.report.isReported).toBe(false);
            expect(updated.report.reason).toBe('Abusive'); // audit trail preserved
        });
    });
});
