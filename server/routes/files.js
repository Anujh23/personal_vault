const express = require('express');
const multer = require('multer');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Configure multer for memory storage (files go to PostgreSQL)
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allowed MIME types
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'text/plain',
            'text/csv'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

// All routes require authentication
router.use(authenticateToken);

// GET /files - List all files for the authenticated user
router.get('/', async (req, res) => {
    try {
        const result = await query(
            `SELECT id, file_name, file_type, file_size, uploaded_at, record_type, record_id
            FROM files 
            ORDER BY uploaded_at DESC`,
            []
        );

        res.json({
            success: true,
            files: result.rows.map(r => ({
                ...r,
                mime_type: r.file_type
            }))
        });
    } catch (error) {
        console.error('Error listing all files:', error);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// POST /files/upload - Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const recordType = req.body.recordType || req.body.record_type;
        const recordId = req.body.recordId || req.body.record_id;

        // Validate record type
        const validTypes = ['personal_info', 'properties', 'assets', 'banking_details', 'policies', 'stocks', 'loans', 'business_info', 'family_members', 'reminders', 'income_sheet'];
        if (!validTypes.includes(recordType)) {
            return res.status(400).json({ error: 'Invalid record type' });
        }

        // Verify record exists (shared data - no user_id filter)
        const recordCheck = await query(
            `SELECT id FROM ${recordType} WHERE id = $1`,
            [recordId]
        );

        if (recordCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        // Store file in PostgreSQL (shared data - user_id = 1 for all)
        const result = await query(
            `INSERT INTO files (user_id, record_type, record_id, file_name, file_type, file_size, file_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, file_name, file_type, file_size, uploaded_at, record_type, record_id`,
            [
                1,
                recordType,
                recordId,
                req.file.originalname,
                req.file.mimetype,
                req.file.size,
                req.file.buffer // Binary content
            ]
        );

        res.status(201).json({
            success: true,
            file: {
                ...result.rows[0],
                mime_type: result.rows[0].file_type
            }
        });
    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// GET /files/:id - Download file
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'SELECT file_name, file_type, file_data FROM files WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        const file = result.rows[0];

        // Set headers for file download
        res.setHeader('Content-Type', file.file_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);

        // Send binary content
        res.send(file.file_data);
    } catch (error) {
        console.error('File download error:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// GET /files/record/:table/:recordId - List files for a record
router.get('/record/:table/:recordId', async (req, res) => {
    try {
        const { table, recordId } = req.params;

        const validTypes = ['personal_info', 'properties', 'assets', 'banking_details', 'policies', 'stocks', 'loans', 'business_info', 'family_members', 'reminders', 'income_sheet'];
        if (!validTypes.includes(table)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        const result = await query(
            `SELECT id, file_name, file_type, file_size, uploaded_at 
            FROM files 
            WHERE record_type = $1 AND record_id = $2
            ORDER BY uploaded_at DESC`,
            [table, recordId]
        );

        res.json({
            success: true,
            files: result.rows.map(r => ({
                ...r,
                mime_type: r.file_type
            }))
        });
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// DELETE /files/:id - Delete file
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM files WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        console.error('File delete error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

module.exports = router;
