const express = require('express');
const router = express.Router();
const ownerDashboardController = require('../controllers/ownerDashboardController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('owner', 'manager', 'admin'));

/**
 * @swagger
 * /api/owner/dashboard:
 *   get:
 *     summary: Get aggregated metrics and business performance for venue owner
 *     tags: [OwnerDashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, this_month, last_month]
 *     responses:
 *       200:
 *         description: Owner dashboard data retrieved successfully
 */
router.get('/', ownerDashboardController.getOwnerDashboardMetrics);

module.exports = router;
