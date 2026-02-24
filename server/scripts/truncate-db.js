const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

// Use the Render PostgreSQL connection
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

const truncateTables = async () => {
    const client = await pool.connect();

    try {
        console.log('🔄 Connecting to Render PostgreSQL...\n');

        // Test connection
        const testResult = await client.query('SELECT version(), current_database()');
        console.log('✅ Connected to:', testResult.rows[0].current_database);
        console.log();

        console.log('🗑️ Truncating all tables...\n');

        // Truncate all tables in correct order (child tables first)
        const tables = [
            'activity_logs',
            'files',
            'reminder_files',
            'reminders',
            'income_sheet',
            'loans',
            'business_info',
            'policies',
            'stocks',
            'banking_details',
            'assets',
            'properties',
            'family_members',
            'shareholdings',
            'personal_info'
        ];

        for (const table of tables) {
            await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`);
            console.log(`✅ Truncated ${table}`);
        }

        console.log('\n🎉 All tables truncated successfully!');
        console.log('📝 All data has been removed and IDs reset to 1');

    } catch (error) {
        console.error('❌ Error truncating tables:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
};

truncateTables()
    .then(() => {
        console.log('\n✨ Database truncation complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Database truncation failed:', error);
        process.exit(1);
    });
