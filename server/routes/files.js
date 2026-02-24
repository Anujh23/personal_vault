const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Helper function to validate table name (security)
const VALID_TABLES = [
    'personal_info', 'family_members', 'shareholdings', 'properties',
    'assets', 'banking_details', 'stocks', 'policies', 'business_info',
    'loans', 'income_sheet', 'reminders'
];

const isValidTable = (table) => VALID_TABLES.includes(table);

// Get files for a specific record from entity table
router.get('/record/:table/:id', authenticateToken, async (req, res) => {
    try {
        const { table, id } = req.params;

        if (!isValidTable(table)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        // Get files from entity table
        const result = await query(
            `SELECT files FROM ${table} WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        let files = result.rows[0].files || [];
        console.log('🔍 Raw files from DB:', files);

        if (typeof files === 'string') {
            files = JSON.parse(files);
        }

        // Return file metadata without the actual data
        const filesMetadata = files.map(f => ({
            id: f.id,
            file_name: f.name || f.file_name,
            file_type: f.type || f.file_type,
            file_size: f.size || f.file_size,
            uploaded_at: f.uploaded_at
        }));

        console.log('🔍 Files metadata to return:', filesMetadata);
        res.json({ files: filesMetadata });
    } catch (error) {
        console.error('Error getting record files:', error);
        res.status(500).json({ error: 'Failed to get files', details: error.message });
    }
});

// Upload file to entity table
router.post('/upload/:table/:id', authenticateToken, async (req, res) => {
    try {
        const { table, id } = req.params;

        if (!isValidTable(table)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        // Check if record exists
        const recordCheck = await query(
            `SELECT id, files FROM ${table} WHERE id = $1`,
            [id]
        );

        if (recordCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        // Handle file upload from request body
        const { name, type, size, data } = req.body;

        if (!name || !data) {
            return res.status(400).json({ error: 'File name and data are required' });
        }

        // Generate unique file ID
        const fileId = Date.now().toString(36) + Math.random().toString(36).substr(2);

        // Create file object
        const newFile = {
            id: fileId,
            name: name,
            type: type || 'application/octet-stream',
            size: size || 0,
            data: data, // base64 encoded
            uploaded_at: new Date().toISOString()
        };

        // Get current files array
        let currentFiles = recordCheck.rows[0].files || [];
        if (typeof currentFiles === 'string') {
            currentFiles = JSON.parse(currentFiles);
        }

        // Add new file
        currentFiles.push(newFile);

        // Update entity table
        await query(
            `UPDATE ${table} SET files = $1::jsonb WHERE id = $2`,
            [JSON.stringify(currentFiles), id]
        );

        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                id: fileId,
                name: name,
                type: type,
                size: size
            }
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Failed to upload file', details: error.message });
    }
});

// Download file from entity table
router.get('/download/:table/:recordId/:fileId', authenticateToken, async (req, res) => {
    try {
        const { table, recordId, fileId } = req.params;

        if (!isValidTable(table)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        // Get files from entity table
        const result = await query(
            `SELECT files FROM ${table} WHERE id = $1`,
            [recordId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        let files = result.rows[0].files || [];
        if (typeof files === 'string') {
            files = JSON.parse(files);
        }

        // Find the specific file
        const file = files.find(f => f.id === fileId);

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Decode base64 data
        const fileData = Buffer.from(file.data, 'base64');

        // Set headers and send file
        res.setHeader('Content-Type', file.type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.name || file.file_name}"`);
        res.setHeader('Content-Length', fileData.length);

        res.send(fileData);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ error: 'Failed to download file', details: error.message });
    }
});

// Delete file from entity table
router.delete('/:table/:recordId/:fileId', authenticateToken, async (req, res) => {
    try {
        const { table, recordId, fileId } = req.params;

        if (!isValidTable(table)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        // Get current files
        const result = await query(
            `SELECT files FROM ${table} WHERE id = $1`,
            [recordId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        let files = result.rows[0].files || [];
        if (typeof files === 'string') {
            files = JSON.parse(files);
        }

        // Find file index - convert both to string for comparison
        const fileIndex = files.findIndex(f => String(f.id) === String(fileId));

        if (fileIndex === -1) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Remove file from array
        files.splice(fileIndex, 1);

        // Update entity table
        await query(
            `UPDATE ${table} SET files = $1::jsonb WHERE id = $2`,
            [JSON.stringify(files), recordId]
        );

        res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: 'Failed to delete file', details: error.message });
    }
});

// Get all files across all tables (for admin/management)
router.get('/all', authenticateToken, async (req, res) => {
    try {
        const allFiles = [];

        for (const table of VALID_TABLES) {
            try {
                const result = await query(
                    `SELECT id, files FROM ${table} WHERE files IS NOT NULL AND files != '[]'`
                );

                for (const row of result.rows) {
                    let files = row.files || [];
                    if (typeof files === 'string') {
                        files = JSON.parse(files);
                    }

                    for (const file of files) {
                        allFiles.push({
                            ...file,
                            table: table,
                            record_id: row.id,
                            name: file.name || file.file_name,
                            type: file.type || file.file_type,
                            size: file.size || file.file_size
                        });
                    }
                }
            } catch (e) {
                console.warn(`Error fetching files from ${table}:`, e.message);
            }
        }

        res.json({ files: allFiles });
    } catch (error) {
        console.error('Error getting all files:', error);
        res.status(500).json({ error: 'Failed to get files', details: error.message });
    }
});

module.exports = router;
