-- Migration: Add 'Pending' status to reminders table
-- Run this in your Render PostgreSQL database to update the status constraint

-- First, check if the constraint exists and drop it
ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_status_check;

-- Add the updated constraint with 'Pending' included
ALTER TABLE reminders ADD CONSTRAINT reminders_status_check 
    CHECK (status IN ('Active', 'Pending', 'Completed', 'Cancelled'));

-- Verify the constraint was updated
SELECT conname, pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'reminders'::regclass 
AND conname = 'reminders_status_check';
