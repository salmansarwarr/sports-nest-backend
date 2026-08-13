const express = require('express');
const router = express.Router();
const supportTicketController = require('../controllers/supportTicketController');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadAttachments } = require('../middleware/upload');
const {
    createTicketValidation,
    addMessageValidation,
    updateTicketStatusValidation,
    getTicketsQueryValidation,
    mongoIdValidation,
} = require('../middleware/supportValidation');

/**
 * @swagger
 * tags:
 *   name: SupportTickets
 *   description: Customer support ticketing
 */

/**
 * @swagger
 * /api/support-tickets:
 *   post:
 *     summary: Create a support ticket
 *     tags: [SupportTickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Support ticket created successfully
 */
router.post(
    '/',
    authenticate,
    uploadAttachments.array('attachments', 5),
    createTicketValidation,
    supportTicketController.createTicket
);

/**
 * @swagger
 * /api/support-tickets:
 *   get:
 *     summary: List support tickets (own for regular users, all for admin)
 *     tags: [SupportTickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Support tickets retrieved successfully
 */
router.get('/', authenticate, getTicketsQueryValidation, supportTicketController.getTickets);

/**
 * @swagger
 * /api/support-tickets/{id}:
 *   get:
 *     summary: Get a single support ticket
 *     tags: [SupportTickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Support ticket retrieved successfully
 */
router.get('/:id', authenticate, mongoIdValidation, supportTicketController.getTicket);

/**
 * @swagger
 * /api/support-tickets/{id}/messages:
 *   post:
 *     summary: Add a message to a support ticket
 *     tags: [SupportTickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Message added successfully
 */
router.post(
    '/:id/messages',
    authenticate,
    uploadAttachments.array('attachments', 5),
    mongoIdValidation,
    addMessageValidation,
    supportTicketController.addMessage
);

/**
 * @swagger
 * /api/support-tickets/{id}/status:
 *   put:
 *     summary: Update a support ticket's status/priority/assignment
 *     tags: [SupportTickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Support ticket updated successfully
 */
router.put(
    '/:id/status',
    authenticate,
    authorize('admin'),
    mongoIdValidation,
    updateTicketStatusValidation,
    supportTicketController.updateTicketStatus
);

module.exports = router;
