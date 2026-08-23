const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/adminDashboardController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('admin'));

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get aggregated dashboard KPI statistics and analytics
 *     tags: [AdminDashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [today, 7d, 30d, 90d, this_month, last_month]
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 */
router.get('/', adminDashboardController.getAdminDashboardMetrics);

module.exports = router;
