// @vitest-environment node

import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adoptMigrations,
  applyMigrations,
  createPostgresMigrationLedger,
  inspectMigrations,
  readMigrationDirectory,
  type MigrationLedger,
} from "./index.ts";
import type { MigrationFile } from "../../application/schema-migrations/index.ts";

const databaseUrl = process.env.STORYRAIL_TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

/**
 * The runner's whole job is to bring an unknown database to a known state, so it is tested
 * against real databases it creates and drops itself rather than against the shared test schema.
 * That also keeps it from racing the persistence suite, which owns `storyrail_test`.
 */
const SCRATCH = "storyrail_migration_runner_test";

describePostgres("PostgreSQL migration runner", () => {
  let maintenance: Pool;
  let files: readonly MigrationFile[];
  let scratchUrl: string;

  beforeAll(async () => {
    const url = new URL(databaseUrl as string);
    if (!url.pathname.endsWith("/storyrail_test"))
      throw new Error("Migration runner tests require STORYRAIL_TEST_DATABASE_URL.");
    url.pathname = `/${SCRATCH}`;
    scratchUrl = url.toString();
    maintenance = new Pool({ connectionString: databaseUrl });
    ignoreAdministratorTermination(maintenance);
    files = await readMigrationDirectory(resolve(process.cwd(), "database/migrations"));
  }, 30_000);

  afterAll(async () => {
    await dropScratch();
    await maintenance.end();
  }, 30_000);

  /**
   * Dropping the scratch database terminates any backend still attached to it, and PostgreSQL
   * reports that to the client as an error on a socket the client is already closing. It is an
   * expected part of tearing a database down rather than a fault, and it arrives asynchronously,
   * so it has to be handled where it lands or it surfaces as an unhandled exception.
   */
  function ignoreAdministratorTermination(pool: Pool): void {
    pool.on("error", (error: Error & { readonly code?: string }) => {
      if (error.code !== "57P01") throw error;
    });
  }

  async function dropScratch(): Promise<void> {
    await maintenance.query(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  }

  /** A database with nothing in it, torn down however the test ends. */
  async function withFreshDatabase(
    work: (context: { readonly pool: Pool; readonly ledger: MigrationLedger }) => Promise<void>,
  ): Promise<void> {
    await dropScratch();
    await maintenance.query(`CREATE DATABASE ${SCRATCH}`);
    const pool = new Pool({ connectionString: scratchUrl });
    ignoreAdministratorTermination(pool);
    const ledger = await createPostgresMigrationLedger(pool);
    try {
      await work({ pool, ledger });
    } finally {
      await ledger.release();
      await pool.end();
      // Dropped here rather than only before the next test, so no connection outlives the test
      // that opened it and nothing is left for a later FORCE to terminate.
      await dropScratch();
    }
  }

  it("brings an empty database to the current schema and records every file", async () => {
    await withFreshDatabase(async ({ ledger }) => {
      const report = await applyMigrations(ledger, files);

      expect(report.problems).toEqual([]);
      expect(report.failed).toBeNull();
      expect(report.applied).toEqual(files.map(({ name }) => name));
      await expect(inspectMigrations(ledger, files)).resolves.toMatchObject({
        pending: [],
        problems: [],
      });
    });
  }, 60_000);

  it("does nothing on a second run", async () => {
    await withFreshDatabase(async ({ ledger }) => {
      await applyMigrations(ledger, files);

      const second = await applyMigrations(ledger, files);

      expect(second.applied).toEqual([]);
      expect(second.problems).toEqual([]);
    });
  }, 60_000);

  it("applies only what is missing", async () => {
    await withFreshDatabase(async ({ ledger }) => {
      const upToPolicyRuns = files.filter(({ name }) => name <= "0061-durable-policy-runs.sql");
      await applyMigrations(ledger, upToPolicyRuns);

      const report = await applyMigrations(ledger, files);

      expect(report.applied).toEqual(
        files.filter(({ name }) => name > "0061-durable-policy-runs.sql").map(({ name }) => name),
      );
    });
  }, 60_000);

  it("refuses a database that carries the schema with nothing saying how it got there", async () => {
    await withFreshDatabase(async ({ pool, ledger }) => {
      // Exactly the state of every database that predates this runner.
      await pool.query(await ledgerlessSchema(files));

      const report = await applyMigrations(ledger, files);

      expect(report.applied).toEqual([]);
      expect(report.problems).toEqual([{ code: "MIGRATION_LEDGER_MISSING" }]);
    });
  }, 60_000);

  it("adopts such a database up to the migration the operator names, running nothing", async () => {
    await withFreshDatabase(async ({ pool, ledger }) => {
      await pool.query(await ledgerlessSchema(files));

      const adopted = await adoptMigrations(ledger, files, "0061-durable-policy-runs.sql");

      expect(adopted.problems).toEqual([]);
      expect(adopted.adopted.at(-1)).toBe("0061-durable-policy-runs.sql");
      const report = await inspectMigrations(ledger, files);
      expect(report.applied).toEqual([]);
      expect(report.adopted).toEqual(adopted.adopted);
      expect(report.pending).toEqual(
        files.filter(({ name }) => name > "0061-durable-policy-runs.sql").map(({ name }) => name),
      );
    });
  }, 60_000);

  it("refuses to adopt through a migration this checkout does not have", async () => {
    await withFreshDatabase(async ({ ledger }) => {
      await expect(adoptMigrations(ledger, files, "9999-imaginary.sql")).resolves.toMatchObject({
        adopted: [],
        problems: [{ code: "MIGRATION_ADOPTION_TARGET_UNKNOWN", name: "9999-imaginary.sql" }],
      });
    });
  }, 60_000);

  it("leaves a failed migration recorded as in doubt and refuses to continue past it", async () => {
    await withFreshDatabase(async ({ pool, ledger }) => {
      const broken: MigrationFile[] = [
        ...files.filter(({ name }) => name === "0012-source-evidence.sql"),
        { name: "0099-broken.sql", sql: "BEGIN;\nSELECT this_function_does_not_exist();\nCOMMIT;" },
        {
          name: "0100-after-the-break.sql",
          sql: "BEGIN;\nCREATE TABLE storyrail.later ();\nCOMMIT;",
        },
      ];

      const first = await applyMigrations(ledger, broken);
      expect(first.applied).toEqual(["0012-source-evidence.sql"]);
      expect(first.failed).toMatchObject({ name: "0099-broken.sql" });

      // The file after the failure must not have run.
      await expect(
        pool.query("SELECT to_regclass('storyrail.later') IS NULL AS absent"),
      ).resolves.toMatchObject({ rows: [{ absent: true }] });

      const second = await applyMigrations(ledger, broken);
      expect(second.applied).toEqual([]);
      expect(second.problems).toEqual([{ code: "MIGRATION_IN_DOUBT", name: "0099-broken.sql" }]);
    });
  }, 60_000);

  it("refuses everything once an applied migration has been edited", async () => {
    await withFreshDatabase(async ({ ledger }) => {
      await applyMigrations(ledger, files);
      const edited = files.map((file) =>
        file.name === "0063-newsroom-standards.sql"
          ? { ...file, sql: `${file.sql}\n-- an edit after the fact` }
          : file,
      );

      const report = await applyMigrations(ledger, edited);

      expect(report.problems).toEqual([
        expect.objectContaining({
          code: "MIGRATION_CHANGED_AFTER_APPLYING",
          name: "0063-newsroom-standards.sql",
        }),
      ]);
    });
  }, 60_000);

  it("keeps the ledger append-only against anything but a completion", async () => {
    await withFreshDatabase(async ({ pool, ledger }) => {
      await applyMigrations(ledger, files.slice(0, 1));

      await expect(pool.query("DELETE FROM public.storyrail_schema_migrations")).rejects.toThrow(
        /may not be deleted/,
      );
      await expect(
        pool.query("UPDATE public.storyrail_schema_migrations SET status='running'"),
      ).rejects.toThrow(/may not be changed/);
    });
  }, 60_000);
});

/** The schema as a database that never had a ledger carries it: applied, and unrecorded. */
async function ledgerlessSchema(files: readonly MigrationFile[]): Promise<string> {
  return files.map(({ sql }) => sql).join("\n");
}
