const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/reminders');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'reminder-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        // Allow common file types
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only images, PDFs, Office documents, and text files are allowed'));
        }
    }
});

// Get due reminders (for notification system)
router.get('/due', authenticateToken, async (req, res) => {
    try {
        const now = new Date();

        // Query: Get reminders that are due (reminder_date <= now) 
        // AND either not notified OR snooze time has passed
        // Accept both 'Active' and 'pending' status for backward compatibility
        const queryStr = `
            SELECT r.*, 
                   COALESCE(json_agg(json_build_object(
                       'id', rf.id,
                       'filename', rf.filename,
                       'original_name', rf.original_name,
                       'file_size', rf.file_size,
                       'mime_type', rf.mime_type,
                       'uploaded_at', rf.uploaded_at
                   )) FILTER (WHERE rf.id IS NOT NULL), '[]') as files
            FROM reminders r
            LEFT JOIN reminder_files rf ON r.id = rf.reminder_id
            WHERE r.user_id = $1 
            AND (r.status = 'Active' OR r.status = 'pending')
            AND r.reminder_date <= $2
            AND (
                r.notification_sent = false 
                OR r.notification_sent IS NULL 
                OR (r.snooze_until IS NOT NULL AND r.snooze_until <= $2)
            )
            GROUP BY r.id
            ORDER BY r.reminder_date ASC
        `;

        const { rows } = await query(queryStr, [req.user.id, now]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching due reminders:', error);
        res.status(500).json({ error: 'Failed to fetch reminders' });
    }
});

// Mark reminder as completed
router.post('/:id/complete', authenticateToken, async (req, res) => {
    try {
        const queryStr = `
            UPDATE reminders 
            SET status = 'Completed',
                notification_sent = true,
                updated_at = NOW()
            WHERE id = $1 
            AND user_id = $2
            RETURNING *
        `;

        const { rows } = await query(queryStr, [req.params.id, req.user.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reminder not found' });
        }

        res.json({
            success: true,
            reminder: rows[0],
            message: 'Reminder marked as completed'
        });
    } catch (error) {
        console.error('Error completing reminder:', error);
        res.status(500).json({ error: 'Failed to complete reminder' });
    }
});

// Mark reminder as notified
router.post('/:id/notified', authenticateToken, async (req, res) => {
    try {
        const queryStr = `
            UPDATE reminders 
            SET notification_sent = true, 
                updated_at = NOW() 
            WHERE id = $1 
            AND user_id = $2
            RETURNING *
        `;

        const { rows } = await query(queryStr, [req.params.id, req.user.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reminder not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error updating reminder notification status:', error);
        res.status(500).json({ error: 'Failed to update reminder' });
    }
});

// Snooze reminder (like alarm clock snooze)
router.post('/:id/snooze', authenticateToken, async (req, res) => {
    try {
        const { minutes } = req.body;
        const snoozeMinutes = minutes || 5; // Default 5 minutes

        // Calculate new reminder time
        const snoozeUntil = new Date();
        snoozeUntil.setMinutes(snoozeUntil.getMinutes() + snoozeMinutes);

        const queryStr = `
            UPDATE reminders 
            SET snooze_count = snooze_count + 1,
                snooze_until = $3,
                notification_sent = false,
                updated_at = NOW()
            WHERE id = $1 
            AND user_id = $2
            RETURNING *
        `;

        const { rows } = await query(queryStr, [req.params.id, req.user.id, snoozeUntil]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reminder not found' });
        }

        res.json({
            success: true,
            reminder: rows[0],
            message: `Reminder snoozed for ${snoozeMinutes} minutes`
        });
    } catch (error) {
        console.error('Error snoozing reminder:', error);
        res.status(500).json({ error: 'Failed to snooze reminder' });
    }
});

// Schedule reminder for a specific date/time
router.post('/:id/schedule', authenticateToken, async (req, res) => {
    try {
        const { reminder_date } = req.body;

        if (!reminder_date) {
            return res.status(400).json({ error: 'reminder_date is required' });
        }

        const queryStr = `
            UPDATE reminders 
            SET reminder_date = $3,
                notification_sent = false,
                snooze_until = NULL,
                updated_at = NOW()
            WHERE id = $1 
            AND user_id = $2
            RETURNING *
        `;

        const { rows } = await query(queryStr, [req.params.id, req.user.id, reminder_date]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reminder not found' });
        }

        const formattedDate = new Date(reminder_date).toLocaleString();
        res.json({
            success: true,
            reminder: rows[0],
            message: `Reminder scheduled for ${formattedDate}`
        });
    } catch (error) {
        console.error('Error scheduling reminder:', error);
        res.status(500).json({ error: 'Failed to schedule reminder' });
    }
});

// Upload file for reminder
router.post('/:id/files', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const reminderId = req.params.id;

        // Verify reminder exists and belongs to user
        const reminderCheck = await query(
            'SELECT id FROM reminders WHERE id = $1 AND user_id = $2',
            [reminderId, req.user.id]
        );

        if (reminderCheck.rows.length === 0) {
            // Delete uploaded file if reminder not found
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Reminder not found' });
        }

        // Save file info to database
        const queryStr = `
            INSERT INTO reminder_files (reminder_id, filename, original_name, file_size, mime_type, file_path)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;

        const { rows } = await query(queryStr, [
            reminderId,
            req.file.filename,
            req.file.originalname,
            req.file.size,
            req.file.mimetype,
            req.file.path
        ]);

        res.json({
            success: true,
            file: rows[0]
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        // Clean up uploaded file on error
        if (req.file && req.file.path) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// Get files for reminder
router.get('/:id/files', authenticateToken, async (req, res) => {
    try {
        const queryStr = `
            SELECT id, filename, original_name, file_size, mime_type, uploaded_at
            FROM reminder_files
            WHERE reminder_id = $1
            ORDER BY uploaded_at DESC
        `;

        const { rows } = await query(queryStr, [req.params.id]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching reminder files:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

// Download file
router.get('/files/:fileId/download', authenticateToken, async (req, res) => {
    try {
        // Get file info and verify ownership
        const queryStr = `
            SELECT rf.*, r.user_id
            FROM reminder_files rf
            JOIN reminders r ON rf.reminder_id = r.id
            WHERE rf.id = $1
        `;

        const { rows } = await query(queryStr, [req.params.fileId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (rows[0].user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const file = rows[0];

        if (!fs.existsSync(file.file_path)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        res.setHeader('Content-Type', file.mime_type);

        const fileStream = fs.createReadStream(file.file_path);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// Delete file
router.delete('/files/:fileId', authenticateToken, async (req, res) => {
    try {
        // Get file info and verify ownership
        const queryStr = `
            SELECT rf.*, r.user_id
            FROM reminder_files rf
            JOIN reminders r ON rf.reminder_id = r.id
            WHERE rf.id = $1
        `;

        const { rows } = await query(queryStr, [req.params.fileId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (rows[0].user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const file = rows[0];

        // Delete physical file
        if (fs.existsSync(file.file_path)) {
            fs.unlinkSync(file.file_path);
        }

        // Delete from database
        await query('DELETE FROM reminder_files WHERE id = $1', [req.params.fileId]);

        res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

module.exports = router;
