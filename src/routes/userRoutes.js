const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const User = require('../models/User');
const Venue = require('../models/Venue');
const auditLog = require('../utils/auditLog');
const { body, validationResult } = require('express-validator');

/**
 * @desc    List all users (admin only)
 * @route   GET /api/users
 */
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
    try {
        const { role, search, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (role) filter.role = role;
        if (search) {
            const rx = new RegExp(search, 'i');
            filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [users, total] = await Promise.all([
            User.find(filter)
                .select('firstName lastName email role isEmailVerified isActive createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            User.countDocuments(filter),
        ]);

        res.json({ success: true, data: users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    } catch (err) {
        next(err);
    }
});

/**
 * @desc    Create a new user with a specified role (admin only)
 * @route   POST /api/users
 */
router.post(
    '/',
    authenticate,
    authorize('admin'),
    [
        body('firstName').trim().notEmpty().withMessage('First name is required'),
        body('lastName').trim().notEmpty().withMessage('Last name is required'),
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
        body('role').isIn(['user', 'owner', 'manager']).withMessage('Role must be user, owner, or manager'),
        body('phone').optional().trim(),
    ],
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ success: false, errors: errors.array() });
            }

            const { firstName, lastName, email, password, role, phone } = req.body;

            const existing = await User.findOne({ email });
            if (existing) {
                return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
            }

            const user = new User({
                firstName,
                lastName,
                email,
                password,
                role,
                phone: phone || undefined,
                isEmailVerified: true, // Admin-created accounts are pre-verified
                isActive: true,
            });

            await user.save();

            await auditLog.record({
                actor: req.user,
                action: 'user.created',
                resourceType: 'User',
                resourceId: user._id,
                changes: { role: user.role, email: user.email },
                req,
            });

            res.status(201).json({
                success: true,
                message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully.`,
                data: {
                    _id: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    role: user.role,
                },
            });
        } catch (err) {
            next(err);
        }
    }
);

/**
 * @desc    Update a user's role (admin only)
 * @route   PATCH /api/users/:id/role
 */
router.patch(
    '/:id/role',
    authenticate,
    authorize('admin'),
    [body('role').isIn(['user', 'owner', 'manager', 'admin']).withMessage('Invalid role')],
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ success: false, errors: errors.array() });
            }

            const before = await User.findById(req.params.id).select('role');
            if (!before) return res.status(404).json({ success: false, message: 'User not found.' });

            // Changing a venue owner away from the 'owner' role would orphan
            // their venue (it would keep referencing a non-owner user, with
            // no UI path to reassign or reach it). Block the demotion until
            // the venue is reassigned or deleted.
            if (before.role === 'owner' && req.body.role !== 'owner') {
                const ownedVenue = await Venue.findOne({ owner: req.params.id }).select('name');
                if (ownedVenue) {
                    return res.status(409).json({
                        success: false,
                        message: `Cannot change role: this user owns the venue "${ownedVenue.name}". Reassign or delete that venue before changing their role.`,
                    });
                }
            }

            const user = await User.findByIdAndUpdate(
                req.params.id,
                { role: req.body.role },
                { new: true, select: 'firstName lastName email role' }
            );

            await auditLog.record({
                actor: req.user,
                action: 'user.role_changed',
                resourceType: 'User',
                resourceId: user._id,
                changes: { from: before.role, to: req.body.role },
                req,
            });

            res.json({ success: true, message: `Role updated to ${req.body.role}.`, data: user });
        } catch (err) {
            next(err);
        }
    }
);

/**
 * @desc    Deactivate / reactivate a user account (admin only)
 * @route   PATCH /api/users/:id/status
 */
router.patch(
    '/:id/status',
    authenticate,
    authorize('admin'),
    [body('isActive').isBoolean()],
    async (req, res, next) => {
        try {
            const user = await User.findByIdAndUpdate(
                req.params.id,
                { isActive: req.body.isActive },
                { new: true, select: 'firstName lastName email role isActive' }
            );
            if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

            await auditLog.record({
                actor: req.user,
                action: 'user.status_changed',
                resourceType: 'User',
                resourceId: user._id,
                changes: { isActive: req.body.isActive },
                req,
            });

            res.json({ success: true, message: `Account ${req.body.isActive ? 'activated' : 'deactivated'}.`, data: user });
        } catch (err) {
            next(err);
        }
    }
);

module.exports = router;
