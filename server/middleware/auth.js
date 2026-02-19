const { verifyToken } = require('../config/auth');
const { query } = require('../config/database');

// JWT Authentication Middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Verify user exists and is active
    try {
        const result = await query(
            'SELECT id, username, email, role, is_active FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        if (!user.is_active) {
            return res.status(403).json({ error: 'User account is disabled' });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Logging middleware for activity tracking
const logActivity = async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to capture response
    res.json = (data) => {
        // Restore original method
        res.json = originalJson;

        // Log activity if user is authenticated and method modifies data
        if (req.user && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
            const tableName = req.params.table || req.baseUrl.split('/').pop();
            logToDatabase(req, tableName, data).catch(console.error);
        }

        return res.json(data);
    };

    next();
};

// Helper to log to database
const logToDatabase = async (req, tableName, responseData) => {
    try {
        const ipAddress = req.ip || req.connection.remoteAddress;
        const action = req.method === 'POST' ? 'CREATE' :
            req.method === 'PUT' ? 'UPDATE' : 'DELETE';

        await query(
            `INSERT INTO activity_logs (user_id, action, table_name, record_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                req.user.id,
                action,
                tableName,
                req.params.id || responseData.id || null,
                JSON.stringify({ body: req.body, result: responseData }),
                ipAddress
            ]
        );
    } catch (error) {
        console.error('Activity logging error:', error);
    }
};

module.exports = {
    authenticateToken,
    requireAdmin,
    logActivity
};
