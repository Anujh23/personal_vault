-- Migration: Add insurance_type column to policies table
-- Run this SQL in your PostgreSQL database

-- Add insurance_type column if it doesn't exist
ALTER TABLE policies ADD COLUMN IF NOT EXISTS insurance_type VARCHAR(50);

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'policies' 
ORDER BY ordinal_position;
