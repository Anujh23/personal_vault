const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { 
            userId: user.id, 
            username: user.username,
            role: user.role 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Verify JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

module.exports = {
    JWT_SECRET,
    generateToken,
    verifyToken
};
