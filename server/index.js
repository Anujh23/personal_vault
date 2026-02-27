const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
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

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/src', express.static(path.join(__dirname, '../src')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// Request logging - skip health checks to reduce noise
app.use((req, res, next) => {
    if (req.path !== '/health') {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    }
    next();
});

// Health check endpoint - simple response, no DB check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
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

// Keep database connection fresh (every 1 hour)
const KEEP_ALIVE_INTERVAL = 60 * 60 * 1000; // 1 hour

setInterval(async () => {
    try {
        await query('SELECT 1');
        console.log('💓 DB keep-alive (1 hour)');
    } catch (error) {
        console.error('❌ DB keep-alive failed:', error.message);
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
