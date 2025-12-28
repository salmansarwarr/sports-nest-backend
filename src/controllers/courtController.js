const Court = require('../models/Court');
const Venue = require('../models/Venue');
const { validationResult } = require('express-validator');

/**
 * @desc    Create a new court
 * @route   POST /api/courts
 * @access  Private (Court Owner/Manager/Admin)
 */
exports.createCourt = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        // Verify venue exists and user has permission
        const venue = await Venue.findById(req.body.venue);
        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Check if user is owner or manager of the venue
        const isOwner = venue.owner.toString() === req.user._id.toString();
        const isManager = venue.managers.some(m => m.toString() === req.user._id.toString());
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isManager && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to create courts for this venue'
            });
        }

        // Set owner from authenticated user if not admin
        const courtData = {
            ...req.body,
            owner: isAdmin && req.body.owner ? req.body.owner : req.user._id
        };

        const court = await Court.create(courtData);

        // Update venue stats
        await venue.updateStats();

        res.status(201).json({
            success: true,
            message: 'Court created successfully',
            data: court
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all courts with filtering, sorting, and pagination
 * @route   GET /api/courts
 * @access  Public
 */
exports.getCourts = async (req, res, next) => {
    try {
        const {
            venue,
            sportType,
            courtType,
            surfaceType,
            status = 'active',
            minPrice,
            maxPrice,
            minRating,
            amenities,
            search,
            sortBy = '-stats.averageRating',
            page = 1,
            limit = 20,
            isFeatured,
        } = req.query;

        // Build query
        const query = {};

        // Filter by status (default to active for public)
        if (req.user && (req.user.role === 'admin' || req.user.role === 'owner' || req.user.role === 'manager')) {
            if (status) query.status = status;
        } else {
            query.status = 'active';
        }

        // Venue filter
        if (venue) {
            query.venue = venue;
        }

        // Sport type filter
        if (sportType) {
            query.sportType = sportType;
        }

        // Court type filter (indoor/outdoor)
        if (courtType) {
            query.courtType = courtType;
        }

        // Surface type filter
        if (surfaceType) {
            query.surfaceType = surfaceType;
        }

        // Price range filter
        if (minPrice || maxPrice) {
            query.baseHourlyRate = {};
            if (minPrice) query.baseHourlyRate.$gte = parseFloat(minPrice);
            if (maxPrice) query.baseHourlyRate.$lte = parseFloat(maxPrice);
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

        // Featured filter
        if (isFeatured === 'true') {
            query.isFeatured = true;
        }

        // Text search
        if (search) {
            query.$text = { $search: search };
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Execute query
        const courts = await Court.find(query)
            .populate('venue', 'name displayName address location contact')
            .populate('owner', 'firstName lastName email')
            .sort(sortBy)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get total count for pagination
        const total = await Court.countDocuments(query);

        res.status(200).json({
            success: true,
            count: courts.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: courts
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get single court by ID or slug
 * @route   GET /api/courts/:id
 * @access  Public
 */
exports.getCourt = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Try to find by ID first if it's a valid ObjectId
        let court;
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            court = await Court.findById(id)
                .populate('venue')
                .populate('owner', 'firstName lastName email profilePicture')
                .populate('managers', 'firstName lastName email');
        }

        // If not found by ID or ID was invalid, try by slug
        if (!court) {
            court = await Court.findOne({ slug: id })
                .populate('venue')
                .populate('owner', 'firstName lastName email profilePicture')
                .populate('managers', 'firstName lastName email');
        }

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check if user can view inactive courts
        if (court.status !== 'active' &&
            (!req.user ||
                (req.user.role !== 'admin' &&
                    court.owner.toString() !== req.user._id.toString()))) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        res.status(200).json({
            success: true,
            data: court
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update court
 * @route   PUT /api/courts/:id
 * @access  Private (Owner/Manager/Admin)
 */
exports.updateCourt = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        let court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check authorization
        const venue = await Venue.findById(court.venue);
        const isOwner = court.owner.toString() === req.user._id.toString();
        const isVenueOwner = venue.owner.toString() === req.user._id.toString();
        const isManager = court.managers.some(m => m.toString() === req.user._id.toString()) ||
            venue.managers.some(m => m.toString() === req.user._id.toString());
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isVenueOwner && !isManager && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this court'
            });
        }

        // Prevent changing owner unless admin
        if (req.body.owner && !isAdmin) {
            delete req.body.owner;
        }

        // Prevent changing venue
        if (req.body.venue) {
            delete req.body.venue;
        }

        court = await Court.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        ).populate('venue owner managers');

        // Update venue stats if needed
        if (req.body.stats) {
            await venue.updateStats();
        }

        res.status(200).json({
            success: true,
            message: 'Court updated successfully',
            data: court
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete court
 * @route   DELETE /api/courts/:id
 * @access  Private (Owner/Admin)
 */
exports.deleteCourt = async (req, res, next) => {
    try {
        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check authorization
        const isOwner = court.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this court'
            });
        }

        // TODO: Check for active bookings before deletion
        // For now, we'll just delete

        await court.deleteOne();

        // Update venue stats
        const venue = await Venue.findById(court.venue);
        if (venue) {
            await venue.updateStats();
        }

        res.status(200).json({
            success: true,
            message: 'Court deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Add media to court
 * @route   POST /api/courts/:id/media
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

        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check authorization
        const venue = await Venue.findById(court.venue);
        const isAuthorized =
            court.owner.toString() === req.user._id.toString() ||
            venue.owner.toString() === req.user._id.toString() ||
            (court.managers && court.managers.some(m => m && m.toString() === req.user._id.toString())) ||
            (venue.managers && venue.managers.some(m => m && m.toString() === req.user._id.toString())) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to add media to this court'
            });
        }

        // Support both single media object and array of media
        const mediaArray = Array.isArray(req.body) ? req.body : [req.body];
        
        if (!court.media) {
            court.media = [];
        }

        const startOrder = court.media.length;
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
        if (primaryFoundInBatch || court.media.length === 0) {
            for (let i = 0; i < court.media.length; i++) {
                court.media[i].isPrimary = false;
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
                order: mediaItem.order !== undefined ? mediaItem.order : (startOrder + idx),
                uploadedAt: new Date()
            };

            // Add optional fields if provided
            if (mediaItem.publicId) {
                mediaData.publicId = mediaItem.publicId;
            }
            if (mediaItem.thumbnail) {
                mediaData.thumbnail = mediaItem.thumbnail;
            }

            // Set as primary if:
            // 1. This is the first media ever (court.media.length was 0 before adding)
            // 2. This item is explicitly marked as primary
            if ((startOrder === 0 && idx === 0) || mediaItem.isPrimary === true) {
                mediaData.isPrimary = true;
            }

            court.media.push(mediaData);
            addedMedia.push(court.media[court.media.length - 1]);
        }

        await court.save();

        res.status(200).json({
            success: true,
            message: addedMedia.length === 1 ? 'Media added successfully' : `${addedMedia.length} media items added successfully`,
            data: addedMedia.length === 1 ? addedMedia[0] : addedMedia,
            count: addedMedia.length
        });
    } catch (error) {
        console.error('Error adding media to court:', error);
        next(error);
    }
};

/**
 * @desc    Delete media from court
 * @route   DELETE /api/courts/:id/media/:mediaId
 * @access  Private (Owner/Manager/Admin)
 */
exports.deleteMedia = async (req, res, next) => {
    try {
        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check authorization
        const venue = await Venue.findById(court.venue);
        const isAuthorized =
            court.owner.toString() === req.user._id.toString() ||
            venue.owner.toString() === req.user._id.toString() ||
            court.managers.some(m => m.toString() === req.user._id.toString()) ||
            venue.managers.some(m => m.toString() === req.user._id.toString()) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete media from this court'
            });
        }

        const mediaIndex = court.media.findIndex(m => m._id.toString() === req.params.mediaId);

        if (mediaIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Media not found'
            });
        }

        const wasPrimary = court.media[mediaIndex].isPrimary;
        const publicId = court.media[mediaIndex].publicId;

        // Delete from Cloudinary if publicId exists
        if (publicId) {
            try {
                const { deleteFromCloudinary } = require('../utils/cloudinary');
                await deleteFromCloudinary(publicId);
            } catch (cloudinaryError) {
                console.error('Failed to delete from Cloudinary:', cloudinaryError);
                // Continue with deletion even if Cloudinary deletion fails
            }
        }

        court.media.splice(mediaIndex, 1);

        // If deleted media was primary, set first remaining media as primary
        if (wasPrimary && court.media.length > 0) {
            court.media[0].isPrimary = true;
        }

        await court.save();

        res.status(200).json({
            success: true,
            message: 'Media deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Add pricing rule to court
 * @route   POST /api/courts/:id/pricing-rules
 * @access  Private (Owner/Manager/Admin)
 */
exports.addPricingRule = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check authorization
        const venue = await Venue.findById(court.venue);
        const isAuthorized =
            court.owner.toString() === req.user._id.toString() ||
            venue.owner.toString() === req.user._id.toString() ||
            court.managers.some(m => m.toString() === req.user._id.toString()) ||
            venue.managers.some(m => m.toString() === req.user._id.toString()) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to add pricing rules to this court'
            });
        }

        court.pricingRules.push(req.body);
        await court.save();

        res.status(200).json({
            success: true,
            message: 'Pricing rule added successfully',
            data: court.pricingRules[court.pricingRules.length - 1]
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update pricing rule
 * @route   PUT /api/courts/:id/pricing-rules/:ruleId
 * @access  Private (Owner/Manager/Admin)
 */
exports.updatePricingRule = async (req, res, next) => {
    try {
        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check authorization
        const venue = await Venue.findById(court.venue);
        const isAuthorized =
            court.owner.toString() === req.user._id.toString() ||
            venue.owner.toString() === req.user._id.toString() ||
            court.managers.some(m => m.toString() === req.user._id.toString()) ||
            venue.managers.some(m => m.toString() === req.user._id.toString()) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update pricing rules for this court'
            });
        }

        const ruleIndex = court.pricingRules.findIndex(r => r._id.toString() === req.params.ruleId);

        if (ruleIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Pricing rule not found'
            });
        }

        // Update the rule
        Object.keys(req.body).forEach(key => {
            court.pricingRules[ruleIndex][key] = req.body[key];
        });

        await court.save();

        res.status(200).json({
            success: true,
            message: 'Pricing rule updated successfully',
            data: court.pricingRules[ruleIndex]
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete pricing rule
 * @route   DELETE /api/courts/:id/pricing-rules/:ruleId
 * @access  Private (Owner/Manager/Admin)
 */
exports.deletePricingRule = async (req, res, next) => {
    try {
        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check authorization
        const venue = await Venue.findById(court.venue);
        const isAuthorized =
            court.owner.toString() === req.user._id.toString() ||
            venue.owner.toString() === req.user._id.toString() ||
            court.managers.some(m => m.toString() === req.user._id.toString()) ||
            venue.managers.some(m => m.toString() === req.user._id.toString()) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete pricing rules from this court'
            });
        }

        const ruleIndex = court.pricingRules.findIndex(r => r._id.toString() === req.params.ruleId);

        if (ruleIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Pricing rule not found'
            });
        }

        court.pricingRules.splice(ruleIndex, 1);
        await court.save();

        res.status(200).json({
            success: true,
            message: 'Pricing rule deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Add availability exception
 * @route   POST /api/courts/:id/availability-exceptions
 * @access  Private (Owner/Manager/Admin)
 */
exports.addAvailabilityException = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check authorization
        const venue = await Venue.findById(court.venue);
        const isAuthorized =
            court.owner.toString() === req.user._id.toString() ||
            venue.owner.toString() === req.user._id.toString() ||
            court.managers.some(m => m.toString() === req.user._id.toString()) ||
            venue.managers.some(m => m.toString() === req.user._id.toString()) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to add availability exceptions to this court'
            });
        }

        const exceptionData = {
            ...req.body,
            createdBy: req.user._id
        };

        court.availabilityExceptions.push(exceptionData);
        await court.save();

        res.status(200).json({
            success: true,
            message: 'Availability exception added successfully',
            data: court.availabilityExceptions[court.availabilityExceptions.length - 1]
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete availability exception
 * @route   DELETE /api/courts/:id/availability-exceptions/:exceptionId
 * @access  Private (Owner/Manager/Admin)
 */
exports.deleteAvailabilityException = async (req, res, next) => {
    try {
        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check authorization
        const venue = await Venue.findById(court.venue);
        const isAuthorized =
            court.owner.toString() === req.user._id.toString() ||
            venue.owner.toString() === req.user._id.toString() ||
            court.managers.some(m => m.toString() === req.user._id.toString()) ||
            venue.managers.some(m => m.toString() === req.user._id.toString()) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete availability exceptions from this court'
            });
        }

        const exceptionIndex = court.availabilityExceptions.findIndex(
            e => e._id.toString() === req.params.exceptionId
        );

        if (exceptionIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Availability exception not found'
            });
        }

        court.availabilityExceptions.splice(exceptionIndex, 1);
        await court.save();

        res.status(200).json({
            success: true,
            message: 'Availability exception deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Calculate price for time slot
 * @route   POST /api/courts/:id/calculate-price
 * @access  Public
 */
exports.calculatePrice = async (req, res, next) => {
    try {
        const { startTime, endTime, membershipTier, groupSize, isEarlyBird } = req.body;

        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'Start time and end time are required'
            });
        }

        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        const price = court.calculatePrice(startTime, endTime, {
            membershipTier,
            groupSize,
            isEarlyBird
        });

        const duration = (new Date(endTime) - new Date(startTime)) / (1000 * 60); // in minutes

        res.status(200).json({
            success: true,
            data: {
                baseRate: court.baseHourlyRate,
                totalPrice: price,
                currency: court.currency,
                duration,
                startTime,
                endTime
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Check availability for time slot
 * @route   POST /api/courts/:id/check-availability
 * @access  Public
 */
exports.checkAvailability = async (req, res, next) => {
    try {
        const { startTime, endTime } = req.body;

        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'Start time and end time are required'
            });
        }

        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        const availability = await court.isAvailableForSlot(startTime, endTime);

        res.status(200).json({
            success: true,
            data: {
                ...availability,
                startTime,
                endTime
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update court status
 * @route   PATCH /api/courts/:id/status
 * @access  Private (Owner/Manager/Admin)
 */
exports.updateStatus = async (req, res, next) => {
    try {
        const { status, reason } = req.body;

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }

        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: 'Court not found'
            });
        }

        // Check authorization
        const venue = await Venue.findById(court.venue);
        const isAuthorized =
            court.owner.toString() === req.user._id.toString() ||
            venue.owner.toString() === req.user._id.toString() ||
            court.managers.some(m => m.toString() === req.user._id.toString()) ||
            venue.managers.some(m => m.toString() === req.user._id.toString()) ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update court status'
            });
        }

        court.status = status;

        // If setting to maintenance, add to maintenance schedule
        if (status === 'maintenance' && reason) {
            court.maintenanceSchedule.push({
                startDate: new Date(),
                reason
            });
        }

        await court.save();

        res.status(200).json({
            success: true,
            message: 'Court status updated successfully',
            data: court
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get courts by venue
 * @route   GET /api/venues/:venueId/courts
 * @access  Public
 */
exports.getCourtsByVenue = async (req, res, next) => {
    try {
        const { venueId } = req.params;
        const { status = 'active', sortBy = 'courtNumber' } = req.query;

        const venue = await Venue.findById(venueId);
        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        const query = { venue: venueId };

        // Only show active courts to non-authenticated users
        if (!req.user || (req.user.role !== 'admin' && venue.owner.toString() !== req.user._id.toString())) {
            query.status = 'active';
        } else if (status) {
            query.status = status;
        }

        const courts = await Court.find(query)
            .populate('owner', 'firstName lastName email')
            .sort(sortBy)
            .lean();

        res.status(200).json({
            success: true,
            count: courts.length,
            data: courts
        });
    } catch (error) {
        next(error);
    }
};

module.exports = exports;