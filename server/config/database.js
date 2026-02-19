const { Pool } = require('pg');

// PostgreSQL connection pool
// Render provides DATABASE_URL environment variable
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
        ? { rejectUnauthorized: false }
        : false
});

// Test connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL error:', err);
});

// Helper function for queries
const query = async (text, params) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text: text.substring(0, 50), duration, rows: result.rowCount });
        return result;
    } catch (error) {
        console.error('Query error:', error);
        throw error;
    }
};

// Get client from pool for transactions
const getClient = async () => {
    return await pool.connect();
};

module.exports = {
    pool,
    query,
    getClient
};
