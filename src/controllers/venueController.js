const Venue = require('../models/Venue');
const Court = require('../models/Court');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const auditLog = require('../utils/auditLog');

/**
 * @desc    Create a new venue
 * @route   POST /api/venues
 * @access  Private (Admin/Owner)
 */
exports.createVenue = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        // Admin must supply an owner userId in the request body
        const ownerId = req.body.owner;
        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: 'owner (userId) is required when creating a venue as admin'
            });
        }

        // Enforce one venue per owner
        const existingVenue = await Venue.findOne({ owner: ownerId });
        if (existingVenue) {
            return res.status(409).json({
                success: false,
                message: 'This user already owns a venue. Each owner may only manage one venue.'
            });
        }

        const { documents, ...restBody } = req.body;

        if (!Array.isArray(documents) || documents.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one legal document (business license, ownership proof, etc.) is required to create a venue'
            });
        }

        const venueData = {
            ...restBody,
            owner: ownerId,
            // Admin-created venues are immediately active and pre-verified
            status: 'active',
            verification: {
                isVerified: true,
                verifiedAt: new Date(),
                verifiedBy: req.user._id,
                // Documents are supplied and vetted by the admin at creation
                // time, so they're live/approved immediately — there is no
                // separate review step for the initial set.
                documents: documents.map((doc) => ({
                    type: doc.type,
                    url: doc.url,
                    publicId: doc.publicId,
                    uploadedAt: new Date(),
                    status: 'approved',
                })),
            },
        };
        const venue = await Venue.create(venueData);

        res.status(201).json({
            success: true,
            message: 'Venue created successfully',
            data: venue
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all venues with filtering, sorting, and pagination
 * @route   GET /api/venues
 * @access  Public
 */
exports.getVenues = async (req, res, next) => {
    try {
        const {
            search,
            city,
            state,
            country,
            latitude,
            longitude,
            maxDistance = 10000,
            minRating,
            amenities,
            status = 'active',
            isFeatured,
            isPromoted,
            hasPendingDocumentRequests,
            sortBy = '-stats.averageRating',
            page = 1,
            limit = 20,
        } = req.query;

        // Build query
        const query = {};

        // Filter by status (default to active for public)
        if (req.user && req.user.role === 'admin') {
            if (status) query.status = status;
        } else {
            query.status = 'active';
        }

        // Admin-only: venues with at least one owner-submitted document
        // request still awaiting review (independent of the venue's overall
        // status, since a venue is normally already active/verified).
        if (hasPendingDocumentRequests === 'true' && req.user && req.user.role === 'admin') {
            query['verification.documentRequests.status'] = 'pending';
        }

        // Location-based search
        if (latitude && longitude) {
            query.location = {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: parseInt(maxDistance)
                }
            };
        }

        // Text / keyword search
        if (search) {
            query.$or = [
                { name: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') },
                { 'address.city': new RegExp(search, 'i') },
                { tags: new RegExp(search, 'i') },
            ];
        }

        // Address filters
        if (city) {
            query['address.city'] = new RegExp(city, 'i');
        }

        if (state) {
            query['address.state'] = new RegExp(state, 'i');
        }

        if (country) {
            query['address.country'] = new RegExp(country, 'i');
        }

        // Rating filter
        if (minRating) {
            query['stats.averageRating'] = { $gte: parseFloat(minRating) };
        }

        // Amenities filter. Most amenity fields are plain booleans
        // (amenities.<key> === true), but parking/lockers/wifi are nested
        // objects ({ available, ... }), so they need to be matched on their
        // `available` sub-field instead.
        if (amenities) {
            const nestedAvailabilityAmenities = new Set(['parking', 'lockers', 'wifi']);
            const amenitiesList = Array.isArray(amenities) ? amenities : amenities.split(',');
            amenitiesList.forEach(amenity => {
                const key = nestedAvailabilityAmenities.has(amenity)
                    ? `amenities.${amenity}.available`
                    : `amenities.${amenity}`;
                query[key] = true;
            });
        }

        // Featured/Promoted filters
        if (isFeatured === 'true') {
            query.isFeatured = true;
        }

        if (isPromoted === 'true') {
            query.isPromoted = true;
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Verification documents are only exposed to admins (needed to review
        // submissions in the verification queue) — hidden from the public.
        const isAdmin = Boolean(req.user && req.user.role === 'admin');

        // Execute query
        let venuesQuery = Venue.find(query)
            .populate('owner', 'firstName lastName email profilePicture')
            .sort(sortBy)
            .skip(skip)
            .limit(parseInt(limit));

        if (!isAdmin) {
            venuesQuery = venuesQuery.select('-verification.documents -verification.documentRequests');
        }

        const venues = await venuesQuery.lean();

        // Get total count for pagination
        const total = await Venue.countDocuments(query);

        res.status(200).json({
            success: true,
            count: venues.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: venues
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get single venue by ID or slug
 * @route   GET /api/venues/:id
 * @access  Public
 */
exports.getVenue = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Try to find by ID first if it's a valid ObjectId
        let venue;
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            venue = await Venue.findById(id)
                .populate('owner', 'firstName lastName email profilePicture')
                .populate('managers', 'firstName lastName email');
        }

        // If not found by ID or ID was invalid, try by slug
        if (!venue) {
            venue = await Venue.findOne({ slug: id })
                .populate('owner', 'firstName lastName email profilePicture')
                .populate('managers', 'firstName lastName email');
        }

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Check if user can view inactive venues
        if (venue.status !== 'active' &&
            (!req.user ||
                (req.user.role !== 'admin' &&
                    venue.owner._id.toString() !== req.user._id.toString()))) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Get courts count for this venue
        const courtsCount = await Court.countDocuments({
            venue: venue._id,
            status: 'active'
        });

        const venueData = venue.toObject();
        venueData.activeCourtsCount = courtsCount;

        // Verification documents/requests are only exposed to admins and the
        // venue's own owner — hidden from the public and other users.
        const isAdmin = Boolean(req.user && req.user.role === 'admin');
        const isOwner = Boolean(req.user && venue.owner._id.toString() === req.user._id.toString());
        if (!isAdmin && !isOwner) {
            delete venueData.verification.documents;
            delete venueData.verification.documentRequests;
        }

        if (req.user) {
            req.user.addRecentlyViewed('Venue', venue._id);
            req.user.save().catch((err) => console.error('Failed to record recently viewed venue:', err));
        }

        res.status(200).json({
            success: true,
            data: venueData
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update venue
 * @route   PUT /api/venues/:id
 * @access  Private (Owner/Manager/Admin)
 */
exports.updateVenue = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        let venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Check authorization
        const isOwner = venue.owner.toString() === req.user._id.toString();
        const isManager = venue.managers.some(m => m.toString() === req.user._id.toString());
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isManager && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this venue'
            });
        }

        // Prevent changing owner unless admin
        if (req.body.owner && !isAdmin) {
            delete req.body.owner;
        }

        // Prevent managers from changing certain fields
        if (isManager && !isOwner && !isAdmin) {
            delete req.body.status;
            delete req.body.verification;
            delete req.body.managers;
        }

        venue = await Venue.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        ).populate('owner managers');

        res.status(200).json({
            success: true,
            message: 'Venue updated successfully',
            data: venue
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete venue
 * @route   DELETE /api/venues/:id
 * @access  Private (Owner/Admin)
 */
exports.deleteVenue = async (req, res, next) => {
    try {
        const venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Check authorization — deletion is admin-only per platform policy
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this venue'
            });
        }

        // Check if venue has courts
        const courtsCount = await Court.countDocuments({ venue: venue._id });

        if (courtsCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete venue. It has ${courtsCount} associated court(s). Please delete all courts first.`
            });
        }

        await venue.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Venue deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Find nearby venues
 * @route   GET /api/venues/nearby
 * @access  Public
 */
exports.getNearbyVenues = async (req, res, next) => {
    try {
        const { latitude, longitude, maxDistance = 10000, limit = 20 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const venues = await Venue.findNearby(
            parseFloat(longitude),
            parseFloat(latitude),
            parseInt(maxDistance),
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            count: venues.length,
            data: venues
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Add media to venue
 * @route   POST /api/venues/:id/media
 * @access  Private (Owner/Manager/Admin)
 */
exports.addMedia = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Check authorization
        const isAuthorized =
            venue.owner.toString() === req.user._id.toString() ||
            (venue.managers && venue.managers.some(m => m.toString() === req.user._id.toString())) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to add media to this venue'
            });
        }

        // Support both single media object and array of media
        const mediaArray = Array.isArray(req.body) ? req.body : [req.body];
        
        if (!venue.media) {
            venue.media = [];
        }

        const startOrder = venue.media.length;
        const addedMedia = [];
        let primaryFoundInBatch = false;

        // First pass: check if any media in the batch is marked as primary
        for (const mediaItem of mediaArray) {
            if (mediaItem.isPrimary === true) {
                primaryFoundInBatch = true;
                break;
            }
        }

        // If any media is marked as primary or this is the first media, set all existing media to non-primary
        if (primaryFoundInBatch || venue.media.length === 0) {
            for (let i = 0; i < venue.media.length; i++) {
                venue.media[i].isPrimary = false;
            }
        }

        // Process each media item
        for (let idx = 0; idx < mediaArray.length; idx++) {
            const mediaItem = mediaArray[idx];
            
            const mediaData = {
                type: mediaItem.type,
                url: mediaItem.url,
                altText: mediaItem.altText || '',
                isPrimary: false,
                order: mediaItem.order !== undefined ? mediaItem.order : (startOrder + idx)
            };

            // Add optional fields if provided
            if (mediaItem.publicId) {
                mediaData.publicId = mediaItem.publicId;
            }
            if (mediaItem.thumbnail) {
                mediaData.thumbnail = mediaItem.thumbnail;
            }

            // Set as primary if:
            // 1. This is the first media ever (venue.media.length was 0 before adding)
            // 2. This item is explicitly marked as primary
            if ((startOrder === 0 && idx === 0) || mediaItem.isPrimary === true) {
                mediaData.isPrimary = true;
            }

            venue.media.push(mediaData);
            addedMedia.push(venue.media[venue.media.length - 1]);
        }

        await venue.save();

        res.status(200).json({
            success: true,
            message: addedMedia.length === 1 ? 'Media added successfully' : `${addedMedia.length} media items added successfully`,
            data: addedMedia.length === 1 ? addedMedia[0] : addedMedia,
            count: addedMedia.length
        });
    } catch (error) {
        console.error('Error adding media to venue:', error);
        next(error);
    }
};

/**
 * @desc    Delete media from venue
 * @route   DELETE /api/venues/:id/media/:mediaId
 * @access  Private (Owner/Manager/Admin)
 */
exports.deleteMedia = async (req, res, next) => {
    try {
        const venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Check authorization
        const isAuthorized =
            venue.owner.toString() === req.user._id.toString() ||
            (venue.managers && venue.managers.some(m => m.toString() === req.user._id.toString())) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete media from this venue'
            });
        }

        if (!venue.media || !Array.isArray(venue.media)) {
            return res.status(404).json({
                success: false,
                message: 'Media not found'
            });
        }

        const mediaIndex = venue.media.findIndex(m => m._id && m._id.toString() === req.params.mediaId);

        if (mediaIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Media not found'
            });
        }

        const wasPrimary = venue.media[mediaIndex].isPrimary;
        const publicId = venue.media[mediaIndex].publicId;

        // Delete from Cloudinary if publicId exists
        if (publicId) {
            try {
                const { deleteFromCloudinary } = require('../utils/cloudinary');
                await deleteFromCloudinary(publicId);
            } catch (cloudinaryError) {
                console.error('Failed to delete from Cloudinary:', cloudinaryError);
                // Continue with database deletion even if Cloudinary deletion fails
            }
        }

        venue.media.splice(mediaIndex, 1);

        // If deleted media was primary, set first remaining media as primary
        if (wasPrimary && venue.media.length > 0) {
            venue.media[0].isPrimary = true;
        }

        await venue.save();

        res.status(200).json({
            success: true,
            message: 'Media deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update venue status
 * @route   PATCH /api/venues/:id/status
 * @access  Private (Owner/Admin)
 */
exports.updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }

        const venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Check authorization
        const isOwner = venue.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update venue status'
            });
        }

        venue.status = status;
        await venue.save();

        res.status(200).json({
            success: true,
            message: 'Venue status updated successfully',
            data: venue
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Verify venue (Admin only)
 * @route   POST /api/venues/:id/verify
 * @access  Private (Admin)
 */
exports.verifyVenue = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can verify venues'
            });
        }

        const venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        const { status, notes } = req.body;
        const isApproved = status !== 'rejected';

        venue.verification.isVerified = isApproved;
        venue.verification.verifiedAt = new Date();
        venue.verification.verifiedBy = req.user._id;
        if (notes) venue.verification.notes = notes;

        // Also activate the venue if it was pending and got approved
        if (isApproved && venue.status === 'pending-verification') {
            venue.status = 'active';
        }

        await venue.save();

        await auditLog.record({
            actor: req.user,
            action: isApproved ? 'venue.verified' : 'venue.verification_rejected',
            resourceType: 'Venue',
            resourceId: venue._id,
            reason: notes,
            req
        });

        res.status(200).json({
            success: true,
            message: isApproved ? 'Venue verified successfully' : 'Venue verification rejected',
            data: venue
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Request a legal document be added/updated on a venue. Owners
 *          cannot update the live document set directly — an admin must
 *          approve the request first (see updateVerificationDocumentStatus).
 * @route   POST /api/venues/:id/verification-documents
 * @access  Private (Owner)
 */
exports.addVerificationDocument = async (req, res, next) => {
    try {
        let type = req.body.type || req.body.documentType;
        let url = req.body.url || req.body.documentUrl;
        let publicId = req.body.publicId;

        if ((!type || !url) && Array.isArray(req.body.documents) && req.body.documents.length > 0) {
            const doc = req.body.documents[0];
            type = doc.type || doc.documentType;
            url = doc.url || doc.documentUrl;
            publicId = doc.publicId;
        }

        if (type) {
            type = type.replace(/_/g, '-');
            if (type === 'ownership-deed') type = 'ownership-proof';
            if (type === 'tax-registration') type = 'tax-document';
            if (type === 'utility-bill') type = 'other';
        }

        if (!type || !url) {
            return res.status(400).json({
                success: false,
                message: 'Document type and URL are required'
            });
        }

        const venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Check authorization
        if (venue.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to add verification documents to this venue'
            });
        }

        venue.verification.documentRequests.push({
            type,
            url,
            publicId,
            requestedBy: req.user._id,
            requestedAt: new Date(),
            status: 'pending'
        });

        await venue.save();

        await auditLog.record({
            actor: req.user,
            action: 'venue.document_requested',
            resourceType: 'Venue',
            resourceId: venue._id,
            changes: { type },
            req
        });

        res.status(200).json({
            success: true,
            message: 'Document update request submitted. An admin will review it before it takes effect.',
            data: venue.verification.documentRequests[venue.verification.documentRequests.length - 1]
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update verification document status (Admin only)
 * @route   PATCH /api/venues/:id/verification-documents/:docId
 * @access  Private (Admin)
 */
exports.updateVerificationDocumentStatus = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can update document status'
            });
        }

        const { status } = req.body;

        if (!status || !['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Valid status (approved/rejected) is required'
            });
        }

        const venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        const request = venue.verification.documentRequests.id(req.params.docId);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Document request not found'
            });
        }

        request.status = status;
        request.reviewedBy = req.user._id;
        request.reviewedAt = new Date();
        const reviewNotes = req.body.reviewNotes || req.body.rejectionReason;
        if (reviewNotes) request.reviewNotes = reviewNotes;

        // Approval copies the document into the live, approved set — this is
        // the only way `verification.documents` changes after venue creation.
        if (status === 'approved') {
            venue.verification.documents.push({
                type: request.type,
                url: request.url,
                publicId: request.publicId,
                uploadedAt: new Date(),
                status: 'approved',
            });
        }

        await venue.save();

        await auditLog.record({
            actor: req.user,
            action: 'venue.verification_document_reviewed',
            resourceType: 'Venue',
            resourceId: venue._id,
            changes: { requestId: request._id, status },
            req
        });

        res.status(200).json({
            success: true,
            message: `Document request ${status} successfully`,
            data: request
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get user's venues
 * @route   GET /api/venues/my-venues
 * @access  Private
 */
exports.getMyVenues = async (req, res, next) => {
    try {
        const { status, sortBy = '-createdAt', page = 1, limit = 20 } = req.query;

        const query = {
            $or: [
                { owner: req.user._id },
                { managers: req.user._id }
            ]
        };

        if (status) {
            query.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Owners viewing their own venue(s) should see their own uploaded
        // verification documents and review status.
        const venues = await Venue.find(query)
            .sort(sortBy)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('managers', 'firstName lastName email')
            .lean();

        const total = await Venue.countDocuments(query);

        res.status(200).json({
            success: true,
            count: venues.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: venues
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update venue statistics
 * @route   POST /api/venues/:id/update-stats
 * @access  Private (Owner/Admin)
 */
exports.updateVenueStats = async (req, res, next) => {
    try {
        const venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Check authorization
        const isOwner = venue.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update venue statistics'
            });
        }

        await venue.updateStats();

        res.status(200).json({
            success: true,
            message: 'Venue statistics updated successfully',
            data: venue.stats
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Add a manager to a venue, looked up by email
 * @route   POST /api/venues/:id/managers
 * @access  Private (Owner of the venue, Admin)
 */
exports.addManager = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        const isOwner = venue.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to manage staff for this venue'
            });
        }

        const { email } = req.body;
        const targetUser = await User.findOne({ email: email.toLowerCase().trim() });

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'No user found with that email address. They must already have an account.'
            });
        }

        if (targetUser._id.toString() === venue.owner.toString()) {
            return res.status(400).json({
                success: false,
                message: 'The venue owner cannot also be added as a manager'
            });
        }

        if (venue.managers.some((m) => m.toString() === targetUser._id.toString())) {
            return res.status(409).json({
                success: false,
                message: 'This user is already a manager of this venue'
            });
        }

        venue.managers.push(targetUser._id);
        await venue.save();

        // Managers must hold the 'manager' role to pass role-gated routes;
        // don't downgrade a user who already has broader access (owner/admin).
        if (targetUser.role === 'user') {
            targetUser.role = 'manager';
            await targetUser.save();
        }

        await auditLog.record({
            actor: req.user,
            action: 'venue.manager_added',
            resourceType: 'Venue',
            resourceId: venue._id,
            changes: { managerId: targetUser._id, email: targetUser.email },
            req
        });

        const updated = await Venue.findById(venue._id).populate('managers', 'firstName lastName email');

        res.status(200).json({
            success: true,
            message: 'Manager added successfully',
            data: updated.managers
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Remove a manager from a venue
 * @route   DELETE /api/venues/:id/managers/:userId
 * @access  Private (Owner of the venue, Admin)
 */
exports.removeManager = async (req, res, next) => {
    try {
        const venue = await Venue.findById(req.params.id);

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        const isOwner = venue.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to manage staff for this venue'
            });
        }

        const { userId } = req.params;

        if (!venue.managers.some((m) => m.toString() === userId)) {
            return res.status(404).json({
                success: false,
                message: 'This user is not a manager of this venue'
            });
        }

        venue.managers = venue.managers.filter((m) => m.toString() !== userId);
        await venue.save();

        await auditLog.record({
            actor: req.user,
            action: 'venue.manager_removed',
            resourceType: 'Venue',
            resourceId: venue._id,
            changes: { managerId: userId },
            req
        });

        const updated = await Venue.findById(venue._id).populate('managers', 'firstName lastName email');

        res.status(200).json({
            success: true,
            message: 'Manager removed successfully',
            data: updated.managers
        });
    } catch (error) {
        next(error);
    }
};

module.exports = exports;