-- Add Loans Table to Existing Database
-- Run this script to add the loans table to your existing PostgreSQL database

-- Create the loans table
CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    borrower_name VARCHAR(200) NOT NULL,
    lender_name VARCHAR(200) NOT NULL,
    loan_type VARCHAR(50) CHECK (loan_type IN ('Personal', 'Home', 'Vehicle', 'Education', 'Business', 'Property', 'Other')),
    loan_amount DECIMAL(15, 2) NOT NULL,
    interest_rate DECIMAL(5, 2),
    loan_term_years INTEGER,
    loan_term_months INTEGER,
    emi_amount DECIMAL(15, 2),
    loan_start_date DATE NOT NULL,
    loan_end_date DATE,
    next_payment_date DATE,
    loan_status VARCHAR(20) CHECK (loan_status IN ('Active', 'Closed', 'Overdue', 'Pending')) NOT NULL,
    collateral TEXT,
    purpose TEXT,
    guarantor VARCHAR(200),
    account_number VARCHAR(50),
    bank_branch VARCHAR(200),
    contact_person VARCHAR(200),
    contact_number VARCHAR(20),
    email VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX idx_loans_user_id ON loans(user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_loans_updated_at BEFORE UPDATE ON loans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update files table to include loans (if needed)
-- This might fail if the constraint already exists, but that's okay
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_record_type_check;
ALTER TABLE files ADD CONSTRAINT files_record_type_check 
    CHECK (record_type IN ('personal_info', 'properties', 'assets', 'banking_details', 'policies', 'stocks', 'loans', 'business_info', 'family_members'));

-- Add comment for documentation
COMMENT ON TABLE loans IS 'Loan information including personal, home, vehicle, education, and business loans';

-- Success message
SELECT 'Loans table created successfully!' as result;
