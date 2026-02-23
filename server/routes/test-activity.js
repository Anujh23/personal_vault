const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/test/activity-logs - Fetch recent activity logs for the user from PostgreSQL
router.get('/activity-logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        
        const result = await query(
            `SELECT id, action, table_name, record_id, details, ip_address, created_at 
             FROM activity_logs 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2`,
            [req.user.id, limit]
        );
        
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching activity logs:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch activity logs',
            message: error.message 
        });
    }
});

// GET /api/test/activity-logs/stats - Get activity statistics
router.get('/activity-logs/stats', async (req, res) => {
    try {
        // Get counts by action type
        const statsResult = await query(
            `SELECT action, COUNT(*) as count 
             FROM activity_logs 
             WHERE user_id = $1 
             GROUP BY action`,
            [req.user.id]
        );
        
        // Get total count
        const totalResult = await query(
            `SELECT COUNT(*) as total 
             FROM activity_logs 
             WHERE user_id = $1`,
            [req.user.id]
        );
        
        // Get most recent activity
        const recentResult = await query(
            `SELECT created_at 
             FROM activity_logs 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [req.user.id]
        );
        
        res.json({
            success: true,
            stats: {
                total: parseInt(totalResult.rows[0]?.total || 0),
                byAction: statsResult.rows,
                lastActivity: recentResult.rows[0]?.created_at || null
            }
        });
    } catch (error) {
        console.error('Error fetching activity stats:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch activity stats',
            message: error.message 
        });
    }
});

module.exports = router;
