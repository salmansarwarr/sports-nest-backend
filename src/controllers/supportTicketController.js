const SupportTicket = require('../models/SupportTicket');
const { validationResult } = require('express-validator');
const auditLog = require('../utils/auditLog');
const { uploadToCloudinary } = require('../utils/cloudinary');

async function uploadAttachmentFiles(files) {
    if (!files || files.length === 0) return [];
    const uploaded = await Promise.all(
        files.map((file) => uploadToCloudinary(file.buffer, { folder: 'sports-nest/support-tickets' }))
    );
    return uploaded.map((result, i) => ({
        url: result.secure_url,
        publicId: result.public_id,
        filename: files[i].originalname,
    }));
}

/**
 * @desc    Create a support ticket
 * @route   POST /api/support-tickets
 * @access  Private
 */
exports.createTicket = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { subject, category, description, relatedBooking } = req.body;
        const attachments = await uploadAttachmentFiles(req.files);

        const ticket = await SupportTicket.create({
            user: req.user._id,
            subject,
            category,
            description,
            relatedBooking,
            attachments
        });

        res.status(201).json({
            success: true,
            message: 'Support ticket created successfully',
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    List support tickets (own tickets for regular users, all for admin)
 * @route   GET /api/support-tickets
 * @access  Private
 */
exports.getTickets = async (req, res, next) => {
    try {
        const { status, category, page = 1, limit = 20 } = req.query;

        const query = req.user.role === 'admin' ? {} : { user: req.user._id };
        if (status) query.status = status;
        if (category) query.category = category;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const tickets = await SupportTicket.find(query)
            .populate('user', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName email')
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const total = await SupportTicket.countDocuments(query);

        res.status(200).json({
            success: true,
            count: tickets.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: tickets
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get a single support ticket
 * @route   GET /api/support-tickets/:id
 * @access  Private (Owner/Admin)
 */
exports.getTicket = async (req, res, next) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id)
            .populate('user', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName email')
            .populate('messages.sender', 'firstName lastName email');

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found'
            });
        }

        const isOwner = ticket.user._id.toString() === req.user._id.toString();
        if (!isOwner && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this ticket'
            });
        }

        res.status(200).json({
            success: true,
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Add a message to a support ticket
 * @route   POST /api/support-tickets/:id/messages
 * @access  Private (Owner/Admin)
 */
exports.addMessage = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found'
            });
        }

        const isOwner = ticket.user.toString() === req.user._id.toString();
        if (!isOwner && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to reply to this ticket'
            });
        }

        const attachments = await uploadAttachmentFiles(req.files);

        ticket.messages.push({
            sender: req.user._id,
            senderRole: req.user.role,
            message: req.body.message,
            attachments
        });

        // Reopen a resolved/closed ticket if the user replies again
        if (isOwner && ['resolved', 'closed'].includes(ticket.status)) {
            ticket.status = 'open';
        }

        await ticket.save();

        res.status(201).json({
            success: true,
            message: 'Message added successfully',
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update a support ticket's status/priority/assignment
 * @route   PUT /api/support-tickets/:id/status
 * @access  Private (Admin)
 */
exports.updateTicketStatus = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { status, priority, assignedTo } = req.body;

        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found'
            });
        }

        if (status) {
            ticket.status = status;
            if (status === 'resolved') ticket.resolvedAt = new Date();
            if (status === 'closed') ticket.closedAt = new Date();
        }
        if (priority) ticket.priority = priority;
        if (assignedTo !== undefined) ticket.assignedTo = assignedTo;

        await ticket.save();

        await auditLog.record({
            actor: req.user,
            action: 'support_ticket.status_changed',
            resourceType: 'SupportTicket',
            resourceId: ticket._id,
            changes: { status, priority, assignedTo },
            req
        });

        res.status(200).json({
            success: true,
            message: 'Support ticket updated successfully',
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};
