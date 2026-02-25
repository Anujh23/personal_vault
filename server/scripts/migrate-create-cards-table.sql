-- Migration: Create cards table for credit/debit card management
-- Run this in your Render PostgreSQL database

-- Create cards table
CREATE TABLE IF NOT EXISTS cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    card_type VARCHAR(20) CHECK (card_type IN ('Credit', 'Debit', 'Prepaid', 'Forex')),
    card_network VARCHAR(20) CHECK (card_network IN ('Visa', 'MasterCard', 'Amex', 'Rupay', 'Diners Club')),
    bank_name VARCHAR(100),
    card_holder_name VARCHAR(200),
    card_number VARCHAR(50) NOT NULL,
    expiry_date DATE NOT NULL,
    cvv VARCHAR(10),
    status VARCHAR(20) CHECK (status IN ('Active', 'Blocked', 'Expired', 'Lost', 'Stolen')),
    daily_limit DECIMAL(15, 2),
    bill_generation_date INTEGER CHECK (bill_generation_date >= 1 AND bill_generation_date <= 31),
    payment_due_date INTEGER CHECK (payment_due_date >= 1 AND payment_due_date <= 31),
    notes TEXT,
    files JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on family_member_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_cards_family_member ON cards(family_member_id);

-- Create index on card_type for filtering
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(card_type);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);

-- Verify table was created
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'cards' 
ORDER BY ordinal_position;
