-- Add family_member_id linking columns to existing database
-- Run this on an existing DB that was created BEFORE family_member_id existed.
-- Safe to run multiple times (uses IF NOT EXISTS where possible).

-- Shareholdings
ALTER TABLE shareholdings ADD COLUMN IF NOT EXISTS family_member_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_shareholdings_family_member'
    ) THEN
        ALTER TABLE shareholdings
            ADD CONSTRAINT fk_shareholdings_family_member
            FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_shareholdings_family_member_id ON shareholdings(family_member_id);

-- Properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS family_member_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_properties_family_member'
    ) THEN
        ALTER TABLE properties
            ADD CONSTRAINT fk_properties_family_member
            FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_properties_family_member_id ON properties(family_member_id);

-- Assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS family_member_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_assets_family_member'
    ) THEN
        ALTER TABLE assets
            ADD CONSTRAINT fk_assets_family_member
            FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_assets_family_member_id ON assets(family_member_id);

-- Banking Details
ALTER TABLE banking_details ADD COLUMN IF NOT EXISTS family_member_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_banking_details_family_member'
    ) THEN
        ALTER TABLE banking_details
            ADD CONSTRAINT fk_banking_details_family_member
            FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_banking_details_family_member_id ON banking_details(family_member_id);

-- Stocks
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS family_member_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_stocks_family_member'
    ) THEN
        ALTER TABLE stocks
            ADD CONSTRAINT fk_stocks_family_member
            FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_stocks_family_member_id ON stocks(family_member_id);

-- Policies
ALTER TABLE policies ADD COLUMN IF NOT EXISTS family_member_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_policies_family_member'
    ) THEN
        ALTER TABLE policies
            ADD CONSTRAINT fk_policies_family_member
            FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_policies_family_member_id ON policies(family_member_id);

-- Loans
ALTER TABLE loans ADD COLUMN IF NOT EXISTS family_member_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_loans_family_member'
    ) THEN
        ALTER TABLE loans
            ADD CONSTRAINT fk_loans_family_member
            FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_loans_family_member_id ON loans(family_member_id);

-- Business Info
ALTER TABLE business_info ADD COLUMN IF NOT EXISTS family_member_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_business_info_family_member'
    ) THEN
        ALTER TABLE business_info
            ADD CONSTRAINT fk_business_info_family_member
            FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_business_info_family_member_id ON business_info(family_member_id);

-- Done
SELECT 'family_member_id columns + FKs + indexes added.' AS result;
