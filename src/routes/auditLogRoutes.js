const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { authenticate, authorize } = require('../middleware/auth');
const { getAuditLogsQueryValidation } = require('../middleware/auditLogValidation');

/**
 * @swagger
 * tags:
 *   name: AuditLogs
 *   description: Admin audit trail
 */

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: List audit log entries
 *     tags: [AuditLogs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *       403:
 *         description: Admin access required
 */
router.get('/', authenticate, authorize('admin'), getAuditLogsQueryValidation, auditLogController.getAuditLogs);

module.exports = router;
