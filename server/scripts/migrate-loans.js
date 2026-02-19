const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Check your .env file.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('🔄 Checking if loans table exists...');
    const exists = await client.query("SELECT to_regclass('public.loans') AS loans");

    if (exists.rows[0]?.loans) {
      console.log('✅ loans table already exists. No migration needed.');
      return;
    }

    console.log('🔄 Creating loans table...');

    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS loans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        borrower_name VARCHAR(200) NOT NULL,
        lender_name VARCHAR(200) NOT NULL,
        loan_type VARCHAR(50),
        loan_amount DECIMAL(15, 2) NOT NULL,
        interest_rate DECIMAL(5, 2),
        loan_term_years INTEGER,
        loan_term_months INTEGER,
        emi_amount DECIMAL(15, 2),
        loan_start_date DATE NOT NULL,
        loan_end_date DATE,
        next_payment_date DATE,
        loan_status VARCHAR(20) NOT NULL,
        collateral TEXT,
        purpose TEXT,
        guarantor VARCHAR(200),
        account_number VARCHAR(50),
        bank_branch VARCHAR(200),
        contact_person VARCHAR(200),
        contact_number VARCHAR(20),
        email VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id)');

    await client.query('COMMIT');
    console.log('✅ Loans migration completed successfully.');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('❌ Loans migration failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

