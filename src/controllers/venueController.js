const Venue = require('../models/Venue');
const Court = require('../models/Court');
const { validationResult } = require('express-validator');

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

        // Set owner from authenticated user if not admin
        const venueData = {
            ...req.body,
            owner: req.user.role === 'admin' && req.body.owner ? req.body.owner : req.user._id
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

        // Text search
        if (search) {
            query.$text = { $search: search };
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

        // Amenities filter
        if (amenities) {
            const amenitiesList = Array.isArray(amenities) ? amenities : amenities.split(',');
            amenitiesList.forEach(amenity => {
                query[`amenities.${amenity}`] = true;
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

        // Execute query
        const venues = await Venue.find(query)
            .populate('owner', 'firstName lastName email')
            .select('-verification.documents')
            .sort(sortBy)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

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
                .populate('managers', 'firstName lastName email')
                .select('-verification.documents');
        }

        // If not found by ID or ID was invalid, try by slug
        if (!venue) {
            venue = await Venue.findOne({ slug: id })
                .populate('owner', 'firstName lastName email profilePicture')
                .populate('managers', 'firstName lastName email')
                .select('-verification.documents');
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

        // Check authorization
        const isOwner = venue.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
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
            venue.managers.some(m => m.toString() === req.user._id.toString()) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to add media to this venue'
            });
        }

        const mediaData = req.body;

        // If this is the first media or marked as primary, set as primary
        if (venue.media.length === 0 || req.body.isPrimary) {
            venue.media.forEach(m => m.isPrimary = false);
            mediaData.isPrimary = true;
        }

        venue.media.push(mediaData);
        await venue.save();

        res.status(200).json({
            success: true,
            message: 'Media added successfully',
            data: venue.media[venue.media.length - 1]
        });
    } catch (error) {
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
            venue.managers.some(m => m.toString() === req.user._id.toString()) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete media from this venue'
            });
        }

        const mediaIndex = venue.media.findIndex(m => m._id.toString() === req.params.mediaId);

        if (mediaIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Media not found'
            });
        }

        const wasPrimary = venue.media[mediaIndex].isPrimary;

        // TODO: Delete from Cloudinary if publicId exists

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

        venue.verification.isVerified = true;
        venue.verification.verifiedAt = new Date();
        venue.verification.verifiedBy = req.user._id;

        // Also activate the venue if it was pending
        if (venue.status === 'pending-verification') {
            venue.status = 'active';
        }

        await venue.save();

        res.status(200).json({
            success: true,
            message: 'Venue verified successfully',
            data: venue
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Add verification document
 * @route   POST /api/venues/:id/verification-documents
 * @access  Private (Owner)
 */
exports.addVerificationDocument = async (req, res, next) => {
    try {
        const { type, url, publicId } = req.body;

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

        venue.verification.documents.push({
            type,
            url,
            publicId,
            uploadedAt: new Date(),
            status: 'pending'
        });

        await venue.save();

        res.status(200).json({
            success: true,
            message: 'Verification document added successfully',
            data: venue.verification.documents[venue.verification.documents.length - 1]
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

        const document = venue.verification.documents.id(req.params.docId);

        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        document.status = status;
        await venue.save();

        res.status(200).json({
            success: true,
            message: `Document ${status} successfully`,
            data: document
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

        const venues = await Venue.find(query)
            .select('-verification.documents')
            .sort(sortBy)
            .skip(skip)
            .limit(parseInt(limit))
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

module.exports = exports;