const express = require('express');
const { query, getClient } = require('../config/database');
const { authenticateToken, logActivity } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);
router.use(logActivity);

// Table configuration (maps table names to allowed columns)
const tableConfig = {
    personal_info: {
        columns: ['name', 'father_name', 'mother_name', 'email', 'phone', 'aadhar', 'gender', 'blood_group', 'date_of_birth', 'designation', 'current_address', 'permanent_address', 'is_self'],
        required: ['name']
    },
    family_members: {
        columns: ['name', 'relationship', 'gender', 'date_of_birth', 'phone', 'email', 'occupation', 'address', 'father_id', 'mother_id', 'is_alive'],
        required: ['name', 'relationship']
    },
    shareholdings: {
        columns: ['family_member_id', 'holder_name', 'company_name', 'entity_type', 'share_holding_certificate_status', 'loan_amount', 'shareholding_percent', 'equity_shares', 'current_value', 'remarks', 'filter_name'],
        required: ['holder_name']
    },
    properties: {
        columns: ['family_member_id', 'name', 'owner_user', 'property_holder_name', 'property_type', 'property_address', 'state', 'total_area', 'rooms_count', 'property_value', 'registration_fees', 'payment_type', 'amount', 'loan_on_property', 'loan_from_bank', 'loan_amount', 'loan_tenure_years', 'total_emi', 'emi_amount', 'total_emi_payment', 'loan_start_date', 'loan_end_date', 'loan_status', 'income_from_property', 'tenant_name', 'rent_agreement_start_date', 'rent_agreement_end_date', 'monthly_rent', 'monthly_maintenance', 'total_income', 'registration_status', 'mutation', 'remark', 'other_documents'],
        required: ['name']
    },
    assets: {
        columns: ['family_member_id', 'name', 'owner_user', 'asset_type', 'asset_category', 'model', 'brand', 'purchase_date', 'purchase_price', 'current_value', 'condition', 'location', 'serial_no', 'has_insurance', 'insurance_provider', 'insurance_expiry_date', 'has_warranty', 'warranty_expiry_date', 'remarks', 'other_documents'],
        required: ['name']
    },
    banking_details: {
        columns: ['family_member_id', 'name', 'account_holder', 'bank_name', 'account_type', 'account_number', 'ifsc_code', 'user_id_bank', 'password', 'branch', 'branch_code', 'contact_no', 'mail_id', 'card_type', 'card_no', 'card_expiry'],
        required: ['name']
    },
    stocks: {
        columns: ['family_member_id', 'name', 'stock_name', 'investment_type', 'entity_name', 'value', 'at_price', 'status', 'profit_loss', 'filter_name'],
        required: ['name']
    },
    policies: {
        columns: ['family_member_id', 'name', 'insured_person_name', 'service_provider', 'policy_name', 'insurance_type', 'login_id', 'password', 'policy_number', 'nominees', 'relation_with_nominees', 'nominees_share_percent', 'premium_mode', 'policy_start_date', 'policy_last_payment_date', 'date_of_maturity', 'policy_status', 'maturity_status', 'premium_paying_term', 'premium_amount', 'total_premium_amount', 'death_sum_assured', 'sum_insured', 'bonus_or_additional', 'other_documents'],
        required: ['name']
    },
    loans: {
        columns: ['family_member_id', 'name', 'borrower_name', 'lender_name', 'loan_type', 'loan_amount', 'interest_rate', 'loan_term_years', 'loan_term_months', 'emi_amount', 'loan_start_date', 'loan_end_date', 'next_payment_date', 'loan_status', 'collateral', 'purpose', 'guarantor', 'account_number', 'bank_branch', 'contact_person', 'contact_number', 'email', 'notes'],
        required: ['name', 'borrower_name', 'lender_name', 'loan_amount', 'loan_start_date', 'loan_status']
    },
    income_sheet: {
        columns: ['family_member_id', 'entry_date', 'narration', 'amount', 'transaction_type', 'category', 'notes'],
        required: ['entry_date', 'narration', 'amount', 'transaction_type']
    },
    business_info: {
        columns: ['family_member_id', 'business_name', 'business_type', 'registration_number', 'gst_number', 'pan_number', 'owner_name', 'business_address', 'contact_number', 'email', 'website', 'established_date', 'industry', 'annual_revenue', 'employee_count', 'bank_account', 'ifsc_code', 'license_numbers', 'tax_registration_details', 'business_description'],
        required: ['business_name']
    },
    reminders: {
        columns: ['title', 'description', 'reminder_date', 'reminder_type', 'priority', 'status', 'related_table', 'related_record_id', 'notification_sent', 'repeat_type', 'repeat_interval'],
        required: ['title']
    }
};

// Helper: Validate table name
const isValidTable = (table) => tableConfig.hasOwnProperty(table);

// Helper: Build INSERT query
const buildInsertQuery = (table, data, userId) => {
    const config = tableConfig[table];
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    // Add user_id first
    values.push(userId);
    placeholders.push(`$${paramIndex++}`);

    // Add other columns
    config.columns.forEach(col => {
        if (data[col] !== undefined) {
            values.push(data[col]);
            placeholders.push(`$${paramIndex++}`);
        }
    });

    const columns = ['user_id', ...config.columns.filter(col => data[col] !== undefined)];
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;

    return { sql, values };
};

// Helper: Build UPDATE query
const buildUpdateQuery = (table, data, id, userId) => {
    const config = tableConfig[table];
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    config.columns.forEach(col => {
        if (data[col] !== undefined) {
            setClauses.push(`${col} = $${paramIndex++}`);
            values.push(data[col]);
        }
    });

    // Add updated_at
    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    // Add id and user_id for WHERE clause
    values.push(id);
    values.push(userId);

    const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex++} RETURNING *`;

    return { sql, values };
};

// GET /api/dashboard/stats - Get dashboard statistics
// NOTE: must be declared BEFORE "/:table/:id" routes to avoid being captured as params.
router.get('/dashboard/stats', async (req, res) => {
    try {
        const tables = Object.keys(tableConfig);
        const stats = {};

        for (const table of tables) {
            const result = await query(
                `SELECT COUNT(*) FROM ${table} WHERE user_id = $1`,
                [req.user.id]
            );
            stats[table] = parseInt(result.rows[0].count);
        }

        // Get file count
        const fileResult = await query(
            'SELECT COUNT(*) FROM files WHERE user_id = $1',
            [req.user.id]
        );
        stats.files = parseInt(fileResult.rows[0].count);

        // Get active reminders count (both 'Active' and 'pending' for backward compatibility)
        const reminderResult = await query(
            `SELECT COUNT(*) FROM reminders WHERE user_id = $1 AND (status = 'Active' OR status = 'pending')`,
            [req.user.id]
        );
        stats.activeReminders = parseInt(reminderResult.rows[0].count);

        // Get upcoming reminders (all active/pending reminders ordered by date)
        const upcomingResult = await query(
            `SELECT * FROM reminders 
             WHERE user_id = $1 AND (status = 'Active' OR status = 'pending')
             ORDER BY reminder_date ASC 
             LIMIT 5`,
            [req.user.id]
        );

        res.json({
            success: true,
            stats,
            upcomingReminders: upcomingResult.rows
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/:table - List all records for user
router.get('/:table', async (req, res) => {
    try {
        const { table } = req.params;

        if (!isValidTable(table)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        // Build query with optional search
        let sql = `SELECT * FROM ${table} WHERE user_id = $1`;
        const values = [req.user.id];
        let paramIndex = 2;

        // Add search filter if provided
        if (req.query.search) {
            const searchCols = tableConfig[table].columns.filter(col =>
                ['name', 'title', 'business_name', 'holder_name', 'company_name'].includes(col)
            );
            if (searchCols.length > 0) {
                const searchConditions = searchCols.map(col => `${col} ILIKE $${paramIndex++}`);
                sql += ` AND (${searchConditions.join(' OR ')})`;
                values.push(`%${req.query.search}%`);
            }
        }

        // Add ordering
        sql += ' ORDER BY created_at DESC';

        // Add pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        sql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        values.push(limit, offset);

        const result = await query(sql, values);

        // Get total count for pagination
        const countResult = await query(
            `SELECT COUNT(*) FROM ${table} WHERE user_id = $1`,
            [req.user.id]
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        console.error(`Error fetching ${req.params.table}:`, error);
        res.status(500).json({ error: 'Failed to fetch records' });
    }
});

// GET /api/:table/:id - Get single record
router.get('/:table/:id', async (req, res) => {
    try {
        const { table, id } = req.params;

        if (!isValidTable(table)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        const result = await query(
            `SELECT * FROM ${table} WHERE id = $1 AND user_id = $2`,
            [id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error(`Error fetching ${req.params.table}:`, error);
        res.status(500).json({ error: 'Failed to fetch record' });
    }
});

// POST /api/:table - Create new record
router.post('/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const data = req.body;

        if (!isValidTable(table)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        // Validate required fields
        const config = tableConfig[table];
        for (const field of config.required) {
            if (!data[field]) {
                return res.status(400).json({ error: `Missing required field: ${field}` });
            }
        }

        // Build and execute insert query
        const { sql, values } = buildInsertQuery(table, data, req.user.id);
        const result = await query(sql, values);

        res.status(201).json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error(`Error creating ${req.params.table}:`, error);
        res.status(500).json({ error: 'Failed to create record' });
    }
});

// PUT /api/:table/:id - Update record
router.put('/:table/:id', async (req, res) => {
    try {
        const { table, id } = req.params;
        const data = req.body;

        if (!isValidTable(table)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        // Build and execute update query
        const { sql, values } = buildUpdateQuery(table, data, id, req.user.id);
        const result = await query(sql, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error(`Error updating ${req.params.table}:`, error);
        res.status(500).json({ error: 'Failed to update record' });
    }
});

// DELETE /api/:table/:id - Delete record
router.delete('/:table/:id', async (req, res) => {
    try {
        const { table, id } = req.params;

        if (!isValidTable(table)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        // Delete record (only if owned by user)
        const result = await query(
            `DELETE FROM ${table} WHERE id = $1 AND user_id = $2 RETURNING id`,
            [id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        res.json({
            success: true,
            message: 'Record deleted successfully'
        });
    } catch (error) {
        console.error(`Error deleting ${req.params.table}:`, error);
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

module.exports = router;
