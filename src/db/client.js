const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for v2 backend.");
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
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
  const schemaPath = path.join(__dirname, "schema.sql");
  const raw = fs.readFileSync(schemaPath, "utf8");
  const statements = raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const statement of statements) {
    // eslint-disable-next-line no-await-in-loop
    await query(statement);
  }
}

module.exports = {
  pool,
  query,
  getOne,
  getMany,
  migrate,
};
