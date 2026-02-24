const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: '../.env' });

const path = require('path');
const { query } = require('./config/database');

const authRoutes = require('./routes/auth');
const crudRoutes = require('./routes/crud');
const fileRoutes = require('./routes/files');
const reminderRoutes = require('./routes/reminders');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for now
}));

// CORS configuration (allow frontend domain)
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

// Rate limiting (skip for static files)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
});
app.use('/api', limiter);
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/src', express.static(path.join(__dirname, '../src')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint with database check
app.get('/health', async (req, res) => {
    try {
        // Check database connection
        await query('SELECT 1');
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: 'connected',
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message
        });
    }
});

// API routes
app.use('/auth', authRoutes);
app.use('/api', crudRoutes);
app.use('/files', fileRoutes);
app.use('/api/reminders', reminderRoutes);

// Serve frontend for root route (including with query strings like /?)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Serve frontend for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Keep-alive ping to prevent Render from spinning down (every 10 minutes)
// AND to keep database connection alive
const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes

setInterval(async () => {
    try {
        // Ping the database to keep connection alive
        await query('SELECT 1');
        console.log('💓 Keep-alive ping successful');
    } catch (error) {
        console.error('❌ Keep-alive ping failed:', error.message);
    }
}, KEEP_ALIVE_INTERVAL);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('🔒 Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('👋 SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('🔒 Server closed');
        process.exit(0);
    });
});

// Catch uncaught errors to prevent crashes
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
    // Don't exit - let the server continue running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit - let the server continue running
});
