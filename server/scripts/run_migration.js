/**
 * Database Migration Script - FIXED VERSION
 * Adds family_member_id columns (INTEGER type to match existing family_members.id)
 * 
 * Run with: node scripts/run_migration.js
 */

require('dotenv').config({ path: '../.env' });
const { query } = require('../config/database');

const tables = [
    'shareholdings',
    'properties',
    'assets',
    'banking_details',
    'stocks',
    'policies',
    'loans',
    'business_info'
];

async function runMigration() {
    console.log('🚀 Starting database migration...\n');

    for (const table of tables) {
        try {
            // First, drop the column if it exists (to fix the UUID/INTEGER mismatch)
            try {
                await query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS family_member_id`);
                console.log(`🗑️  Dropped old family_member_id from ${table} (if existed)`);
            } catch (e) {
                // Ignore errors
            }

            // Add column as INTEGER (to match family_members.id type)
            await query(`ALTER TABLE ${table} ADD COLUMN family_member_id INTEGER`);
            console.log(`✅ Added family_member_id (INTEGER) to ${table}`);

            // Add foreign key (safely - check if exists)
            const fkName = `fk_${table}_family_member`;
            const checkFk = await query(
                `SELECT 1 FROM pg_constraint WHERE conname = $1`,
                [fkName]
            );

            if (checkFk.rows.length === 0) {
                await query(`
                    ALTER TABLE ${table}
                    ADD CONSTRAINT ${fkName}
                    FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE SET NULL
                `);
                console.log(`   🔗 Added FK constraint to ${table}`);
            }

            // Add index
            await query(`CREATE INDEX IF NOT EXISTS idx_${table}_family_member_id ON ${table}(family_member_id)`);
            console.log(`   📇 Added index to ${table}`);

        } catch (err) {
            console.error(`❌ Error with ${table}:`, err.message);
        }
    }

    console.log('\n✅ Migration complete!');
    console.log('\n👉 Now restart your server: npm run dev');
    process.exit(0);
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
