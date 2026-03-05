const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

let connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for v2 backend.");
}

if (process.env.VERCEL === "1" && connectionString.includes("pooler.supabase.com") && !connectionString.includes("workaround=")) {
  connectionString += (connectionString.includes("?") ? "&" : "?") + "workaround=supabase-pooler.vercel";
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function getOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0];
}

async function getMany(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

async function migrate() {
  const directUrl = process.env.DATABASE_DIRECT_URL || process.env.DIRECT_URL;
  const migratePool = directUrl ? new Pool({
    connectionString: directUrl,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  }) : pool;

  const schemaPath = path.join(__dirname, "schema.sql");
  const raw = fs.readFileSync(schemaPath, "utf8");
  const statements = raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  try {
    for (const statement of statements) {
      await migratePool.query(statement);
    }
  } finally {
    if (directUrl && migratePool !== pool) migratePool.end().catch(() => {});
  }
}

module.exports = {
  pool,
  query,
  getOne,
  getMany,
  migrate,
};
