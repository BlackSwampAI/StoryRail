import { Pool } from "pg";

const REQUIRED_DATABASE_NAME = "storyrail_test";

function configuredDatabaseUrl() {
  const configured = process.env.STORYRAIL_DATABASE_URL?.trim();
  if (!configured) {
    throw new Error("STORYRAIL_DATABASE_URL is required to reset browser acceptance state.");
  }

  let parsed;
  let databaseName;
  try {
    parsed = new URL(configured);
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error("STORYRAIL_DATABASE_URL must be a valid PostgreSQL test database URL.");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    parsed.hostname.length === 0 ||
    databaseName !== REQUIRED_DATABASE_NAME
  ) {
    throw new Error(
      "Browser acceptance reset requires a PostgreSQL URL whose database is exactly storyrail_test.",
    );
  }
  return configured;
}

async function reset() {
  const pool = new Pool({ connectionString: configuredDatabaseUrl() });
  try {
    const result = await pool.query("SELECT current_database() AS database_name");
    if (result.rows[0]?.database_name !== REQUIRED_DATABASE_NAME) {
      throw new Error(
        "Browser acceptance reset connected to a database other than storyrail_test and was refused.",
      );
    }
    await pool.query(`
      DROP SCHEMA IF EXISTS storyrail CASCADE;
      DROP TABLE IF EXISTS public.storyrail_schema_migrations CASCADE;
    `);
  } finally {
    await pool.end();
  }
}

await reset();
