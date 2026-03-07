const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

let connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for v2 backend.");
}

if (process.env.VERCEL === "1" && connectionString.includes("pooler.supabase.com")) {
  const sep = connectionString.includes("?") ? "&" : "?";
  if (!connectionString.includes("workaround=")) connectionString += sep + "workaround=supabase-pooler.vercel";
  if (!connectionString.includes("pgbouncer=")) connectionString += (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true";
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  ...(process.env.VERCEL === "1" && { max: 1, idleTimeoutMillis: 10000 }),
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
  if (process.env.VERCEL === "1") {
    return;
  }
  const schemaPath = path.join(__dirname, "schema.sql");
  const raw = fs.readFileSync(schemaPath, "utf8");
  const statements = raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }
}

module.exports = {
  pool,
  query,
  getOne,
  getMany,
  migrate,
};
