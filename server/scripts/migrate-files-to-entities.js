const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

const migrateFilesToEntityTables = async () => {
    const client = await pool.connect();

    try {
        console.log('🔄 Starting file migration to entity tables...\n');

        // 1. Add files column to all entity tables
        const entityTables = [
            'personal_info',
            'family_members',
            'shareholdings',
            'properties',
            'assets',
            'banking_details',
            'stocks',
            'policies',
            'business_info',
            'loans',
            'income_sheet',
            'reminders'
        ];

        console.log('1️⃣ Adding files column to entity tables...');
        for (const table of entityTables) {
            try {
                await client.query(`
                    ALTER TABLE ${table} 
                    ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]'::jsonb
                `);
                console.log(`   ✅ Added files column to ${table}`);
            } catch (e) {
                console.log(`   ℹ️ ${table}: ${e.message}`);
            }
        }

        // 2. Check if old files table exists and migrate data if it does
        console.log('\n2️⃣ Checking for old files table...');

        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM pg_tables 
                WHERE schemaname = 'public' 
                AND tablename = 'files'
            )
        `);

        if (!tableCheck.rows[0].exists) {
            console.log('   ℹ️ Old files table does not exist, skipping data migration');
        } else {
            console.log('   📁 Found old files table, migrating data...');
            const filesResult = await client.query(`
                SELECT id, record_type, record_id, file_name, file_type, file_size, file_data, uploaded_at
                FROM files
                ORDER BY record_type, record_id
            `);

            console.log(`   Found ${filesResult.rows.length} files to migrate`);

            for (const file of filesResult.rows) {
                try {
                    // Convert file_data (BYTEA) to base64
                    const base64Data = file.file_data.toString('base64');

                    // Create file object
                    const fileObj = {
                        id: file.id,
                        name: file.file_name,
                        type: file.file_type,
                        size: file.file_size,
                        data: base64Data,
                        uploaded_at: file.uploaded_at
                    };

                    // Get current files array from entity table
                    const entityResult = await client.query(`
                        SELECT files FROM ${file.record_type} WHERE id = $1
                    `, [file.record_id]);

                    if (entityResult.rows.length > 0) {
                        let currentFiles = entityResult.rows[0].files || [];
                        if (typeof currentFiles === 'string') {
                            currentFiles = JSON.parse(currentFiles);
                        }

                        // Add new file to array
                        currentFiles.push(fileObj);

                        // Update entity table
                        await client.query(`
                            UPDATE ${file.record_type} 
                            SET files = $1::jsonb
                            WHERE id = $2
                        `, [JSON.stringify(currentFiles), file.record_id]);
                    }
                } catch (e) {
                    console.log(`   ❌ Error migrating file ${file.id}: ${e.message}`);
                }
            }

            console.log(`   ✅ Migrated ${filesResult.rows.length} files`);

            // 3. Drop old files table and index
            console.log('\n3️⃣ Dropping old files table...');
            await client.query(`DROP INDEX IF EXISTS idx_files_record`);
            await client.query(`DROP TABLE IF EXISTS files`);
            console.log('   ✅ Dropped old files table and indexes');
        }

        console.log('\n✨ Migration complete!');
        console.log('\nSummary:');
        console.log('- Added files JSONB column to all entity tables');
        console.log('- Migrated existing file data');
        console.log('- Dropped old files table');
        console.log('\nFiles are now stored directly in each entity table!');

    } catch (error) {
        console.error('❌ Migration error:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
};

migrateFilesToEntityTables()
    .then(() => {
        console.log('\n✅ Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Migration failed:', error);
        process.exit(1);
    });
