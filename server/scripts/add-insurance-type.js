const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://customer_insight_user:Nc38P0q0HUqEHDtG8NZ4JqVSLpq58Npv@dpg-d67di7sr85hc73bkr9pg-a.virginia-postgres.render.com/personal_db',
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    try {
        console.log('Adding insurance_type column to policies table...');
        
        await pool.query('ALTER TABLE policies ADD COLUMN IF NOT EXISTS insurance_type VARCHAR(50)');
        console.log('✅ insurance_type column added successfully');
        
        // Verify
        const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'policies' ORDER BY ordinal_position");
        console.log('\n📋 Current policies table columns:');
        cols.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.column_name}`));
        
        await pool.end();
        console.log('\n🎉 Migration completed!');
    } catch (e) {
        console.error('❌ Error:', e.message);
        await pool.end();
        process.exit(1);
    }
}

runMigration();
