-- Personal Dashboard PostgreSQL Schema
-- Run this in your Render PostgreSQL database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (for authentication)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Personal Information
CREATE TABLE personal_info (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    father_name VARCHAR(200),
    mother_name VARCHAR(200),
    email VARCHAR(255),
    phone VARCHAR(20),
    aadhar VARCHAR(20),
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
    blood_group VARCHAR(5) CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    date_of_birth DATE,
    designation VARCHAR(100),
    current_address TEXT,
    permanent_address TEXT,
    is_self BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Family Members (with self-referential relationships)
CREATE TABLE family_members (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    relationship VARCHAR(50) NOT NULL CHECK (relationship IN ('Self', 'Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Cousin', 'Other')),
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
    date_of_birth DATE,
    phone VARCHAR(20),
    email VARCHAR(255),
    occupation VARCHAR(100),
    address TEXT,
    father_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    mother_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    is_alive BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shareholdings
CREATE TABLE shareholdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    holder_name VARCHAR(200) NOT NULL,
    company_name VARCHAR(200),
    entity_type VARCHAR(50) CHECK (entity_type IN ('Private Limited', 'Public Limited', 'Partnership', 'LLP', 'Sole Proprietorship')),
    share_holding_certificate_status VARCHAR(100),
    loan_amount DECIMAL(15, 2),
    shareholding_percent DECIMAL(5, 2),
    equity_shares INTEGER,
    current_value DECIMAL(15, 2),
    remarks TEXT,
    filter_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Properties
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    owner_user VARCHAR(200),
    property_holder_name VARCHAR(200),
    property_type VARCHAR(50) CHECK (property_type IN ('Residential', 'Commercial', 'Agricultural', 'Industrial')),
    property_address TEXT,
    state VARCHAR(50),
    total_area DECIMAL(10, 2),
    rooms_count INTEGER,
    property_value DECIMAL(15, 2),
    registration_fees DECIMAL(15, 2),
    payment_type VARCHAR(20) CHECK (payment_type IN ('Cash', 'Loan', 'Mixed')),
    amount DECIMAL(15, 2),
    loan_on_property BOOLEAN DEFAULT false,
    loan_from_bank VARCHAR(200),
    loan_amount DECIMAL(15, 2),
    loan_tenure_years INTEGER,
    total_emi DECIMAL(15, 2),
    emi_amount DECIMAL(15, 2),
    total_emi_payment DECIMAL(15, 2),
    loan_start_date DATE,
    loan_end_date DATE,
    loan_status VARCHAR(20) CHECK (loan_status IN ('Active', 'Closed', 'Overdue')),
    income_from_property BOOLEAN DEFAULT false,
    tenant_name VARCHAR(200),
    rent_agreement_start_date DATE,
    rent_agreement_end_date DATE,
    monthly_rent DECIMAL(15, 2),
    monthly_maintenance DECIMAL(15, 2),
    total_income DECIMAL(15, 2),
    registration_status VARCHAR(20) CHECK (registration_status IN ('Registered', 'Pending', 'Not Registered')),
    mutation VARCHAR(20) CHECK (mutation IN ('Done', 'Pending', 'Not Required')),
    remark TEXT,
    other_documents TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Assets
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    owner_user VARCHAR(200),
    asset_type VARCHAR(50) CHECK (asset_type IN ('Electronics', 'Jewelry', 'Vehicle', 'Furniture', 'Appliance', 'Other')),
    asset_category VARCHAR(100),
    model VARCHAR(100),
    brand VARCHAR(100),
    purchase_date DATE,
    purchase_price DECIMAL(15, 2),
    current_value DECIMAL(15, 2),
    condition VARCHAR(20) CHECK (condition IN ('Excellent', 'Good', 'Fair', 'Poor')),
    location VARCHAR(200),
    serial_no VARCHAR(100),
    has_insurance BOOLEAN DEFAULT false,
    insurance_provider VARCHAR(200),
    insurance_expiry_date DATE,
    has_warranty BOOLEAN DEFAULT false,
    warranty_expiry_date DATE,
    remarks TEXT,
    other_documents TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Banking Details
CREATE TABLE banking_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    account_holder VARCHAR(200),
    bank_name VARCHAR(200),
    account_type VARCHAR(50) CHECK (account_type IN ('Savings', 'Current', 'Fixed Deposit', 'Recurring Deposit')),
    account_number VARCHAR(50),
    ifsc_code VARCHAR(20),
    user_id_bank VARCHAR(100),
    password VARCHAR(100),
    branch VARCHAR(200),
    branch_code VARCHAR(50),
    contact_no VARCHAR(20),
    mail_id VARCHAR(255),
    card_type VARCHAR(20) CHECK (card_type IN ('Debit Card', 'Credit Card', 'Both', 'None')),
    card_no VARCHAR(50),
    card_expiry VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stocks & Investments
CREATE TABLE stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    stock_name VARCHAR(200),
    investment_type VARCHAR(50) CHECK (investment_type IN ('Equity', 'Mutual Fund', 'Bond', 'ETF', 'Commodity')),
    entity_name VARCHAR(200),
    value DECIMAL(15, 2),
    at_price DECIMAL(15, 2),
    status VARCHAR(20) CHECK (status IN ('Active', 'Sold', 'Hold')),
    profit_loss DECIMAL(15, 2),
    filter_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insurance Policies
CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    insured_person_name VARCHAR(200),
    service_provider VARCHAR(200),
    policy_name VARCHAR(200),
    login_id VARCHAR(100),
    password VARCHAR(100),
    policy_number VARCHAR(100),
    nominees TEXT,
    relation_with_nominees VARCHAR(100),
    nominees_share_percent DECIMAL(5, 2),
    premium_mode VARCHAR(20) CHECK (premium_mode IN ('Monthly', 'Quarterly', 'Half-yearly', 'Annual')),
    policy_start_date DATE,
    policy_last_payment_date DATE,
    date_of_maturity DATE,
    policy_status VARCHAR(20) CHECK (policy_status IN ('Active', 'Lapsed', 'Matured', 'Surrendered')),
    maturity_status VARCHAR(20) CHECK (maturity_status IN ('Pending', 'Matured', 'Not Applicable')),
    premium_paying_term VARCHAR(50),
    premium_amount DECIMAL(15, 2),
    total_premium_amount DECIMAL(15, 2),
    death_sum_assured DECIMAL(15, 2),
    sum_insured DECIMAL(15, 2),
    bonus_or_additional DECIMAL(15, 2),
    other_documents TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Loans
CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
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

-- Income Sheet (Track monthly money in/out)
CREATE TABLE income_sheet (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL,
    family_member_id INTEGER,
    entry_date DATE NOT NULL,
    narration VARCHAR(500) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    transaction_type VARCHAR(10) CHECK (transaction_type IN ('Credit', 'Debit')) NOT NULL,
    category VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Business Information
CREATE TABLE business_info (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    business_name VARCHAR(200) NOT NULL,
    business_type VARCHAR(50) CHECK (business_type IN ('Sole Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'Public Limited', 'Other')),
    registration_number VARCHAR(100),
    gst_number VARCHAR(50),
    pan_number VARCHAR(50),
    owner_name VARCHAR(200),
    business_address TEXT,
    contact_number VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    established_date DATE,
    industry VARCHAR(100),
    annual_revenue DECIMAL(15, 2),
    employee_count INTEGER,
    bank_account VARCHAR(50),
    ifsc_code VARCHAR(20),
    license_numbers TEXT,
    tax_registration_details TEXT,
    business_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reminders
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    reminder_date TIMESTAMP WITH TIME ZONE,
    reminder_type VARCHAR(50) CHECK (reminder_type IN ('General', 'Payment', 'Renewal', 'Meeting', 'Important')),
    priority VARCHAR(20) CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    status VARCHAR(20) CHECK (status IN ('Active', 'Completed', 'Cancelled')),
    related_table VARCHAR(50),
    related_record_id INTEGER,
    notification_sent BOOLEAN DEFAULT false,
    repeat_type VARCHAR(20) CHECK (repeat_type IN ('None', 'Daily', 'Weekly', 'Monthly', 'Yearly')),
    repeat_interval INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Files & Documents (stored in PostgreSQL as bytea)
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    record_type VARCHAR(50) NOT NULL CHECK (record_type IN ('personal_info', 'properties', 'assets', 'banking_details', 'policies', 'stocks', 'loans', 'business_info', 'family_members', 'income_sheet')),
    record_id INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    file_size INTEGER,
    content BYTEA NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Activity Logs (audit trail)
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(50),
    record_id INTEGER,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_personal_info_user_id ON personal_info(user_id);
CREATE INDEX idx_family_members_user_id ON family_members(user_id);
CREATE INDEX idx_family_members_father_id ON family_members(father_id);
CREATE INDEX idx_family_members_mother_id ON family_members(mother_id);
CREATE INDEX idx_shareholdings_family_member_id ON shareholdings(family_member_id);
CREATE INDEX idx_properties_user_id ON properties(user_id);
CREATE INDEX idx_properties_family_member_id ON properties(family_member_id);
CREATE INDEX idx_assets_user_id ON assets(user_id);
CREATE INDEX idx_assets_family_member_id ON assets(family_member_id);
CREATE INDEX idx_banking_details_user_id ON banking_details(user_id);
CREATE INDEX idx_banking_details_family_member_id ON banking_details(family_member_id);
CREATE INDEX idx_stocks_user_id ON stocks(user_id);
CREATE INDEX idx_stocks_family_member_id ON stocks(family_member_id);
CREATE INDEX idx_policies_user_id ON policies(user_id);
CREATE INDEX idx_policies_family_member_id ON policies(family_member_id);
CREATE INDEX idx_loans_user_id ON loans(user_id);
CREATE INDEX idx_loans_family_member_id ON loans(family_member_id);
CREATE INDEX idx_income_sheet_user_id ON income_sheet(user_id);
CREATE INDEX idx_income_sheet_family_member_id ON income_sheet(family_member_id);
CREATE INDEX idx_income_sheet_entry_date ON income_sheet(entry_date);
CREATE INDEX idx_business_info_user_id ON business_info(user_id);
CREATE INDEX idx_business_info_family_member_id ON business_info(family_member_id);
CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_date ON reminders(reminder_date);
CREATE INDEX idx_files_record ON files(record_type, record_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_personal_info_updated_at BEFORE UPDATE ON personal_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_family_members_updated_at BEFORE UPDATE ON family_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shareholdings_updated_at BEFORE UPDATE ON shareholdings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_banking_details_updated_at BEFORE UPDATE ON banking_details
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stocks_updated_at BEFORE UPDATE ON stocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loans_updated_at BEFORE UPDATE ON loans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_income_sheet_updated_at BEFORE UPDATE ON income_sheet
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_business_info_updated_at BEFORE UPDATE ON business_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON reminders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin123 - change this!)
-- Password hashed with bcrypt (10 rounds)
INSERT INTO users (username, email, password_hash, full_name, role)
VALUES (
    'admin',
    'admin@dashboard.com',
    '$2b$10$YourHashedPasswordHere',
    'Administrator',
    'admin'
);

-- Comment on tables for documentation
COMMENT ON TABLE users IS 'User accounts for authentication';
COMMENT ON TABLE personal_info IS 'Personal information records';
COMMENT ON TABLE family_members IS 'Family tree relationships';
COMMENT ON TABLE files IS 'File storage with binary content';
COMMENT ON TABLE activity_logs IS 'Audit trail for all user actions';
