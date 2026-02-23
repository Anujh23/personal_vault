// Migration: Update policies table to add insurance_type and rename other_documents to notes

const { query } = require('../config/database');

async function migratePolicies() {
    try {
        console.log('Starting policies table migration...');

        // Check if insurance_type column exists
        const checkInsuranceType = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'policies' AND column_name = 'insurance_type'
        `);

        if (checkInsuranceType.rows.length === 0) {
            console.log('Adding insurance_type column...');
            await query(`
                ALTER TABLE policies 
                ADD COLUMN insurance_type VARCHAR(50)
            `);
            console.log('✅ insurance_type column added');
        } else {
            console.log('insurance_type column already exists');
        }

        // Check if notes column exists (we'll add it and migrate data from other_documents)
        const checkNotes = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'policies' AND column_name = 'notes'
        `);

        if (checkNotes.rows.length === 0) {
            console.log('Adding notes column...');
            await query(`
                ALTER TABLE policies 
                ADD COLUMN notes TEXT
            `);
            console.log('✅ notes column added');

            // Copy data from other_documents to notes
            console.log('Migrating data from other_documents to notes...');
            await query(`
                UPDATE policies 
                SET notes = other_documents 
                WHERE other_documents IS NOT NULL
            `);
            console.log('✅ Data migrated');
        } else {
            console.log('notes column already exists');
        }

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migratePolicies();
