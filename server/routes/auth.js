const express = require('express');
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { generateToken } = require('../config/auth');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /auth/login - User login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        // Find user
        const result = await query(
            'SELECT id, username, email, password_hash, full_name, role, is_active FROM users WHERE username = $1',
            [username]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        
        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is disabled' });
        }
        
        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Generate token
        const token = generateToken(user);
        
        // Return user info (without password) and token
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// POST /auth/register - Create new user (admin only)
router.post('/register', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { username, email, password, fullName, role = 'user' } = req.body;
        
        // Validate required fields
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password required' });
        }
        
        // Validate role
        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        
        // Check if username or email exists
        const existing = await query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );
        
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        
        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Create user
        const result = await query(
            `INSERT INTO users (username, email, password_hash, full_name, role)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, username, email, full_name, role, created_at`,
            [username, email, passwordHash, fullName, role]
        );
        
        const newUser = result.rows[0];
        
        res.status(201).json({
            success: true,
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                fullName: newUser.full_name,
                role: newUser.role,
                createdAt: newUser.created_at
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// GET /auth/me - Get current user info
router.get('/me', authenticateToken, async (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role
        }
    });
});

// PUT /auth/change-password - Change password
router.put('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }
        
        // Get current password hash
        const result = await query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.id]
        );
        
        const user = result.rows[0];
        
        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        
        // Hash new password
        const newHash = await bcrypt.hash(newPassword, 10);
        
        // Update password
        await query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [newHash, req.user.id]
        );
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

module.exports = router;
