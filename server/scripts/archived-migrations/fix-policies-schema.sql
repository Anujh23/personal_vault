-- Run this SQL in your PostgreSQL database to fix the policies table

-- 1. Add insurance_type column if it doesn't exist
ALTER TABLE policies ADD COLUMN IF NOT EXISTS insurance_type VARCHAR(50);

-- 2. Rename other_documents to notes (or add notes column if you want to keep both)
-- Option A: Rename column (keeps existing data)
-- ALTER TABLE policies RENAME COLUMN other_documents TO notes;

-- Option B: Add notes column and copy data (safer - keeps both temporarily)
ALTER TABLE policies ADD COLUMN IF NOT EXISTS notes TEXT;
UPDATE policies SET notes = other_documents WHERE other_documents IS NOT NULL AND notes IS NULL;

-- 3. Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'policies' 
ORDER BY ordinal_position;
