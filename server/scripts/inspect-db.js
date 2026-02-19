const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

async function describeTable(client, table) {
  const cols = await client.query(
    `
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    ORDER BY ordinal_position
    `,
    [table]
  );
  return cols.rows;
}

async function main() {
  const client = await pool.connect();
  try {
    const tables = ['users', 'personal_info', 'policies', 'files', 'loans'];
    for (const t of tables) {
      const reg = await client.query("SELECT to_regclass($1) AS reg", [`public.${t}`]);
      if (!reg.rows[0]?.reg) {
        console.log(`${t}: MISSING`);
        continue;
      }
      const cols = await describeTable(client, t);
      console.log(`${t}:`);
      for (const c of cols) {
        console.log(`  - ${c.column_name}: ${c.data_type} (${c.udt_name})`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

