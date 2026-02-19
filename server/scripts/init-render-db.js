const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

// Use the Render PostgreSQL connection
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

const createTables = async () => {
    const client = await pool.connect();

    try {
        console.log('🔄 Connecting to Render PostgreSQL...\n');

        // Test connection
        const testResult = await client.query('SELECT version(), current_database()');
        console.log('✅ Connected to:', testResult.rows[0].current_database);
        console.log('   PostgreSQL version:', testResult.rows[0].version.split(' ')[0]);
        console.log();

        console.log('🔄 Creating tables for Personal Dashboard...\n');

        // Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(100),
                role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Users table created');

        // Personal Info table
        await client.query(`
            CREATE TABLE IF NOT EXISTS personal_info (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                father_name VARCHAR(100),
                mother_name VARCHAR(100),
                email VARCHAR(100),
                phone VARCHAR(20),
                aadhar VARCHAR(20),
                gender VARCHAR(10),
                blood_group VARCHAR(10),
                date_of_birth DATE,
                designation VARCHAR(100),
                current_address TEXT,
                permanent_address TEXT,
                is_self BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Personal Info table created');

        // Family Members table
        await client.query(`
            CREATE TABLE IF NOT EXISTS family_members (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                relationship VARCHAR(50) NOT NULL,
                gender VARCHAR(10),
                date_of_birth DATE,
                phone VARCHAR(20),
                email VARCHAR(100),
                occupation VARCHAR(100),
                address TEXT,
                father_id INTEGER REFERENCES family_members(id),
                mother_id INTEGER REFERENCES family_members(id),
                is_alive BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Family Members table created');

        // Shareholdings table
        await client.query(`
            CREATE TABLE IF NOT EXISTS shareholdings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                holder_name VARCHAR(100) NOT NULL,
                company_name VARCHAR(100),
                entity_type VARCHAR(50),
                share_holding_certificate_status VARCHAR(50),
                loan_amount DECIMAL(15, 2),
                shareholding_percent DECIMAL(5, 2),
                equity_shares INTEGER,
                current_value DECIMAL(15, 2),
                remarks TEXT,
                filter_name VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Shareholdings table created');

        // Properties table
        await client.query(`
            CREATE TABLE IF NOT EXISTS properties (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                owner_user VARCHAR(100),
                property_holder_name VARCHAR(100),
                property_type VARCHAR(50),
                property_address TEXT,
                state VARCHAR(50),
                total_area DECIMAL(10, 2),
                rooms_count INTEGER,
                property_value DECIMAL(15, 2),
                registration_fees DECIMAL(15, 2),
                payment_type VARCHAR(50),
                amount DECIMAL(15, 2),
                loan_on_property BOOLEAN DEFAULT false,
                loan_from_bank VARCHAR(100),
                loan_amount DECIMAL(15, 2),
                loan_tenure_years INTEGER,
                total_emi DECIMAL(15, 2),
                emi_amount DECIMAL(15, 2),
                total_emi_payment DECIMAL(15, 2),
                loan_start_date DATE,
                loan_end_date DATE,
                loan_status VARCHAR(50),
                income_from_property DECIMAL(15, 2),
                tenant_name VARCHAR(100),
                rent_agreement_start_date DATE,
                rent_agreement_end_date DATE,
                monthly_rent DECIMAL(15, 2),
                monthly_maintenance DECIMAL(15, 2),
                total_income DECIMAL(15, 2),
                registration_status VARCHAR(50),
                mutation VARCHAR(100),
                remark TEXT,
                other_documents TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Properties table created');

        // Assets table
        await client.query(`
            CREATE TABLE IF NOT EXISTS assets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                owner_user VARCHAR(100),
                asset_type VARCHAR(50),
                asset_category VARCHAR(50),
                model VARCHAR(100),
                brand VARCHAR(100),
                purchase_date DATE,
                purchase_price DECIMAL(15, 2),
                current_value DECIMAL(15, 2),
                condition VARCHAR(50),
                location VARCHAR(100),
                serial_no VARCHAR(100),
                has_insurance BOOLEAN DEFAULT false,
                insurance_provider VARCHAR(100),
                insurance_expiry_date DATE,
                has_warranty BOOLEAN DEFAULT false,
                warranty_expiry_date DATE,
                remarks TEXT,
                other_documents TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Assets table created');

        // Banking Details table
        await client.query(`
            CREATE TABLE IF NOT EXISTS banking_details (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                account_holder VARCHAR(100),
                bank_name VARCHAR(100),
                account_type VARCHAR(50),
                account_number VARCHAR(50),
                ifsc_code VARCHAR(20),
                user_id_bank VARCHAR(50),
                password VARCHAR(100),
                branch VARCHAR(100),
                branch_code VARCHAR(20),
                contact_no VARCHAR(20),
                mail_id VARCHAR(100),
                card_type VARCHAR(50),
                card_no VARCHAR(50),
                card_expiry VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Banking Details table created');

        // Stocks table
        await client.query(`
            CREATE TABLE IF NOT EXISTS stocks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                stock_name VARCHAR(100),
                investment_type VARCHAR(50),
                entity_name VARCHAR(100),
                value DECIMAL(15, 2),
                at_price DECIMAL(15, 2),
                status VARCHAR(50),
                profit_loss DECIMAL(15, 2),
                filter_name VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Stocks table created');

        // Policies table
        await client.query(`
            CREATE TABLE IF NOT EXISTS policies (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                insured_person_name VARCHAR(100),
                service_provider VARCHAR(100),
                policy_name VARCHAR(100),
                login_id VARCHAR(100),
                password VARCHAR(100),
                policy_number VARCHAR(100),
                nominees TEXT,
                relation_with_nominees VARCHAR(100),
                nominees_share_percent DECIMAL(5, 2),
                premium_mode VARCHAR(50),
                policy_start_date DATE,
                policy_last_payment_date DATE,
                date_of_maturity DATE,
                policy_status VARCHAR(50),
                maturity_status VARCHAR(50),
                premium_paying_term INTEGER,
                premium_amount DECIMAL(15, 2),
                total_premium_amount DECIMAL(15, 2),
                death_sum_assured DECIMAL(15, 2),
                sum_insured DECIMAL(15, 2),
                bonus_or_additional DECIMAL(15, 2),
                other_documents TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Policies table created');

        // Business Info table
        await client.query(`
            CREATE TABLE IF NOT EXISTS business_info (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                business_name VARCHAR(100) NOT NULL,
                business_type VARCHAR(50),
                registration_number VARCHAR(50),
                gst_number VARCHAR(50),
                pan_number VARCHAR(50),
                owner_name VARCHAR(100),
                business_address TEXT,
                contact_number VARCHAR(20),
                email VARCHAR(100),
                website VARCHAR(100),
                established_date DATE,
                industry VARCHAR(100),
                annual_revenue DECIMAL(15, 2),
                employee_count INTEGER,
                bank_account VARCHAR(50),
                ifsc_code VARCHAR(20),
                license_numbers TEXT,
                tax_registration_details TEXT,
                business_description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Business Info table created');

        // Reminders table
        await client.query(`
            CREATE TABLE IF NOT EXISTS reminders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                reminder_date TIMESTAMP NOT NULL,
                reminder_type VARCHAR(50),
                priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
                related_table VARCHAR(50),
                related_record_id INTEGER,
                notification_sent BOOLEAN DEFAULT false,
                repeat_type VARCHAR(20),
                repeat_interval INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Reminders table created');

        // Files table
        await client.query(`
            CREATE TABLE IF NOT EXISTS files (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                record_type VARCHAR(50) NOT NULL,
                record_id INTEGER NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                file_type VARCHAR(100),
                file_size INTEGER,
                file_data BYTEA NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Files table created');

        // Activity Logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                action VARCHAR(50) NOT NULL,
                table_name VARCHAR(50),
                record_id INTEGER,
                details JSONB,
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Activity Logs table created');

        // Create indexes for better performance
        await client.query(`CREATE INDEX IF NOT EXISTS idx_personal_info_user_id ON personal_info(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON family_members(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_files_record ON files(record_type, record_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reminders_user_date ON reminders(user_id, reminder_date)`);
        console.log('✅ Indexes created');

        console.log('\n🎉 All tables created successfully in Render PostgreSQL!');

    } catch (error) {
        console.error('❌ Error creating tables:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
};

createTables()
    .then(() => {
        console.log('\n✨ Database initialization complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Database initialization failed:', error);
        process.exit(1);
    });
