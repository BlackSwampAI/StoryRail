import type { Pool, PoolClient } from "pg";

import type {
  AppliedMigration,
  MigrationStatus,
} from "../../application/schema-migrations/index.ts";

/**
 * The ledger lives outside the `storyrail` schema on purpose: migration 0012 creates that schema,
 * so anything inside it cannot exist before the first migration runs. It is the runner's own
 * bookkeeping rather than part of the application schema, and it is not itself a migration —
 * there is no earlier migration that could have created it.
 */
export const LEDGER_TABLE = "public.storyrail_schema_migrations";

/** Serialises runners against each other. Two processes migrating at once is not recoverable. */
const LOCK_KEY = 4_216_071_133;

const CREATE_LEDGER = `
CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
  name text PRIMARY KEY,
  checksum text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  append_position bigint GENERATED ALWAYS AS IDENTITY,
  CONSTRAINT storyrail_schema_migrations_status_check
    CHECK (status IN ('running', 'applied', 'adopted')),
  CONSTRAINT storyrail_schema_migrations_completion_check
    CHECK ((status = 'running') = (completed_at IS NULL)),
  CONSTRAINT storyrail_schema_migrations_checksum_check
    CHECK (checksum ~ '^[0-9a-f]{64}$')
)`;

/**
 * A ledger row may finish, and may never go back to being unfinished or be quietly removed.
 *
 * The same one-way rule the editorial records carry, for the same reason: a history that can be
 * rewritten cannot be used to tell whether something happened.
 */
const CREATE_GUARD = `
CREATE OR REPLACE FUNCTION public.storyrail_schema_migrations_are_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A schema migration record may not be deleted.';
  END IF;
  IF OLD.status <> 'running' THEN
    RAISE EXCEPTION 'A settled schema migration record may not be changed.';
  END IF;
  IF NEW.name <> OLD.name OR NEW.checksum <> OLD.checksum OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'A schema migration record may only be completed, not rewritten.';
  END IF;
  RETURN NEW;
END;
$$`;

export interface MigrationLedger {
  /** Whether the application schema exists, which the ledger alone cannot tell you. */
  schemaExists(): Promise<boolean>;
  list(): Promise<readonly AppliedMigration[]>;
  /** Records the intent to run, before the file is executed. */
  open(name: string, checksum: string): Promise<void>;
  close(name: string, status: Exclude<MigrationStatus, "running">): Promise<void>;
  adopt(name: string, checksum: string): Promise<void>;
  run(sql: string): Promise<void>;
  withLock<T>(work: () => Promise<T>): Promise<T>;
  release(): Promise<void>;
}

export async function createPostgresMigrationLedger(pool: Pool): Promise<MigrationLedger> {
  const client: PoolClient = await pool.connect();
  await client.query(CREATE_LEDGER);
  await client.query(CREATE_GUARD);
  await client.query(`
    DROP TRIGGER IF EXISTS storyrail_schema_migrations_append_only ON ${LEDGER_TABLE};
    CREATE TRIGGER storyrail_schema_migrations_append_only
      BEFORE UPDATE OR DELETE ON ${LEDGER_TABLE}
      FOR EACH ROW EXECUTE FUNCTION public.storyrail_schema_migrations_are_append_only();
  `);

  return {
    async schemaExists() {
      const result = await client.query<{ readonly exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storyrail') AS exists",
      );
      return result.rows[0]?.exists === true;
    },
    async list() {
      const result = await client.query<{
        readonly name: string;
        readonly checksum: string;
        readonly status: MigrationStatus;
      }>(`SELECT name, checksum, status FROM ${LEDGER_TABLE} ORDER BY name`);
      return result.rows.map(({ name, checksum, status }) => ({ name, checksum, status }));
    },
    async open(name, checksum) {
      await client.query(
        `INSERT INTO ${LEDGER_TABLE} (name, checksum, status, started_at)
         VALUES ($1, $2, 'running', now())`,
        [name, checksum],
      );
    },
    async close(name, status) {
      await client.query(
        `UPDATE ${LEDGER_TABLE} SET status = $2, completed_at = now()
         WHERE name = $1 AND status = 'running'`,
        [name, status],
      );
    },
    async adopt(name, checksum) {
      await client.query(
        `INSERT INTO ${LEDGER_TABLE} (name, checksum, status, started_at, completed_at)
         VALUES ($1, $2, 'adopted', now(), now())
         ON CONFLICT (name) DO NOTHING`,
        [name, checksum],
      );
    },
    async run(sql) {
      // Each migration file opens and commits its own transaction, so it is executed as written.
      try {
        await client.query(sql);
      } catch (error) {
        // A file that failed part-way through its own BEGIN never reached COMMIT, and the session
        // is left in an aborted transaction where every later statement is refused — including
        // the ones that record what just happened. Clearing it is what lets the failure be
        // reported at all.
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    },
    async withLock(work) {
      await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
      try {
        return await work();
      } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
      }
    },
    async release() {
      client.release();
    },
  };
}
