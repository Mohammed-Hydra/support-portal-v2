/* eslint-disable no-console */
const { Pool } = require("pg");

async function run() {
  const sourceDb = process.env.SOURCE_DATABASE_URL;
  const targetDb = process.env.DATABASE_URL;
  if (!sourceDb || !targetDb) {
    throw new Error("SOURCE_DATABASE_URL and DATABASE_URL are required.");
  }

  const source = new Pool({ connectionString: sourceDb, ssl: { rejectUnauthorized: false } });
  const target = new Pool({ connectionString: targetDb, ssl: { rejectUnauthorized: false } });

  try {
    console.log("Migrating users...");
    const users = await source.query(
      `SELECT id, name, email, password_hash, role, is_active, created_at FROM users ORDER BY id`
    );
    for (const row of users.rows) {
      await target.query(
        `
          INSERT INTO users (name, email, password_hash, role, is_active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (email) DO NOTHING
        `,
        [row.name, row.email, row.password_hash, row.role, row.is_active, row.created_at]
      );
    }

    console.log("Migrating tickets...");
    const tickets = await source.query(
      `SELECT title AS subject, description, status, priority, channel, created_at, updated_at FROM tickets ORDER BY id`
    );
    for (const row of tickets.rows) {
      await target.query(
        `
          INSERT INTO tickets (subject, description, status, priority, channel, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [row.subject, row.description, row.status, row.priority, row.channel, row.created_at, row.updated_at]
      );
    }
    console.log("Migration completed.");
  } finally {
    await source.end();
    await target.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
