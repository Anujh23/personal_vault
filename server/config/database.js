const { Pool } = require('pg');

// Check if DATABASE_URL is provided
if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
}

// PostgreSQL connection pool with Render-optimized settings
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
        ? { rejectUnauthorized: false }
        : false,
    // Connection pool limits - critical for Render free tier
    max: 5,                    // Maximum connections in pool
    min: 1,                    // Minimum connections to maintain
    acquire: 30000,            // Max ms to acquire connection (30s)
    idle: 10000,               // Max ms connection can be idle (10s)
    connectionTimeoutMillis: 5000,  // Connection timeout (5s)
    statementTimeout: 30000,   // Query timeout (30s)
});

// Test connection with retry logic
let retryCount = 0;
const maxRetries = 5;

const testConnection = async () => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT current_database(), inet_server_addr(), current_user');
        console.log('🗄️  Database:', result.rows[0]);
        client.release();
        console.log('✅ Connected to PostgreSQL');
        retryCount = 0;
    } catch (err) {
        retryCount++;
        console.error(`❌ PostgreSQL connection attempt ${retryCount} failed:`, err.message);

        if (retryCount < maxRetries) {
            console.log(`Retrying in 5 seconds...`);
            setTimeout(testConnection, 5000);
        } else {
            console.error('Max retries reached. Server will continue but DB is unavailable.');
        }
    }
};

// Initial connection test
testConnection();

// Pool event handlers
pool.on('connect', () => {
    console.log('✅ New PostgreSQL client connected');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected PostgreSQL pool error:', err);
    // Don't crash - just log the error
});

pool.on('remove', () => {
    console.log('🔌 PostgreSQL client removed from pool');
});

// Helper function for queries with error handling
const query = async (text, params) => {
    const start = Date.now();
    let client;

    try {
        client = await pool.connect();
        const result = await client.query(text, params);
        const duration = Date.now() - start;

        // Only log non-SELECT queries to reduce noise
        if (!text.trim().toLowerCase().startsWith('select')) {
            console.log('Executed query', { text: text.substring(0, 50), duration, rows: result.rowCount });
        }

        return result;
    } catch (error) {
        console.error('Query error:', error.message);
        console.error('Query:', text.substring(0, 100));
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
};

// Get client from pool for transactions with timeout
const getClient = async () => {
    try {
        const client = await pool.connect();

        // Add query timeout to client
        const originalQuery = client.query.bind(client);
        client.query = async (text, params) => {
            return await Promise.race([
                originalQuery(text, params),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Query timeout')), 30000)
                )
            ]);
        };

        return client;
    } catch (error) {
        console.error('Failed to acquire client from pool:', error.message);
        throw error;
    }
};

// Graceful shutdown handler
const closePool = async () => {
    console.log('🔌 Closing PostgreSQL pool...');
    await pool.end();
    console.log('✅ PostgreSQL pool closed');
};

// Handle process termination
process.on('SIGINT', async () => {
    await closePool();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closePool();
    process.exit(0);
});

module.exports = {
    pool,
    query,
    getClient,
    closePool
};
