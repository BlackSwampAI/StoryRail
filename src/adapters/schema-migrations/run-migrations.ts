import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  migrationChecksum,
  planMigrations,
  type MigrationFile,
  type MigrationProblem,
} from "../../application/schema-migrations/index.ts";
import type { MigrationLedger } from "./postgres-migration-ledger.ts";

export async function readMigrationDirectory(directory: string): Promise<readonly MigrationFile[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  return await Promise.all(
    names.map(async (name) => ({ name, sql: await readFile(join(directory, name), "utf8") })),
  );
}

export interface MigrationReport {
  readonly applied: readonly string[];
  readonly adopted: readonly string[];
  readonly pending: readonly string[];
  readonly problems: readonly MigrationProblem[];
  /** The file that was running when something went wrong, if one was. */
  readonly failed: { readonly name: string; readonly message: string } | null;
}

/**
 * A database that already carries the schema but has no ledger.
 *
 * Every database that predates this runner is in that state, and running the files against it
 * would fail on the first `CREATE TABLE`. Adopting is the operator asserting what is already
 * there; the runner records that it took their word rather than pretending it did the work.
 */
function needsAdoption(schemaExists: boolean, ledgerSize: number): boolean {
  return schemaExists && ledgerSize === 0;
}

export async function inspectMigrations(
  ledger: MigrationLedger,
  files: readonly MigrationFile[],
): Promise<MigrationReport & { readonly unledgered: boolean }> {
  const applied = await ledger.list();
  const plan = planMigrations(files, applied);
  return {
    applied: applied.filter(({ status }) => status === "applied").map(({ name }) => name),
    adopted: applied.filter(({ status }) => status === "adopted").map(({ name }) => name),
    pending: plan.pending.map(({ name }) => name),
    problems: plan.problems,
    failed: null,
    unledgered: needsAdoption(await ledger.schemaExists(), applied.length),
  };
}

/**
 * Applies everything this database is missing, in order, recording each intent before it runs.
 *
 * The record is written before the file is executed and completed afterwards, so a process that
 * dies mid-migration leaves a row saying which file is in doubt rather than a database whose
 * shape nobody can describe. The next run refuses to continue past that row: whether the file
 * committed is a question about this specific database, and answering it is a person's job.
 *
 * Nothing is applied while any problem stands. A runner that changed a schema it could not
 * describe would be the failure this exists to prevent.
 */
export async function applyMigrations(
  ledger: MigrationLedger,
  files: readonly MigrationFile[],
): Promise<MigrationReport> {
  return await ledger.withLock(async () => {
    const existing = await ledger.list();
    const plan = planMigrations(files, existing);
    const base = {
      applied: [] as string[],
      adopted: existing.filter(({ status }) => status === "adopted").map(({ name }) => name),
      pending: plan.pending.map(({ name }) => name),
    };
    if (plan.problems.length > 0) return { ...base, problems: plan.problems, failed: null };
    if (needsAdoption(await ledger.schemaExists(), existing.length))
      return {
        ...base,
        problems: [{ code: "MIGRATION_LEDGER_MISSING" }],
        failed: null,
      };

    const applied: string[] = [];
    for (const file of plan.pending) {
      await ledger.open(file.name, migrationChecksum(file.sql));
      try {
        await ledger.run(file.sql);
      } catch (error) {
        return {
          adopted: base.adopted,
          applied,
          pending: plan.pending.slice(applied.length).map(({ name }) => name),
          problems: [],
          failed: { name: file.name, message: (error as Error).message },
        };
      }
      await ledger.close(file.name, "applied");
      applied.push(file.name);
    }
    return { adopted: base.adopted, applied, pending: [], problems: [], failed: null };
  });
}

/**
 * Records migrations up to and including `through` as already present, without running them.
 *
 * This is how a database that predates the ledger joins it. The operator names the last migration
 * they know was applied, because only they can know it.
 */
export async function adoptMigrations(
  ledger: MigrationLedger,
  files: readonly MigrationFile[],
  through: string | null,
): Promise<{
  readonly adopted: readonly string[];
  readonly problems: readonly MigrationProblem[];
}> {
  return await ledger.withLock(async () => {
    const plan = planMigrations(files, await ledger.list());
    const naming = plan.problems.filter(
      ({ code }) => code === "MIGRATION_NAME_INVALID" || code === "MIGRATION_NUMBER_REUSED",
    );
    if (naming.length > 0) return { adopted: [], problems: naming };

    const cutoff = through === null ? plan.ordered.at(-1)?.name : through;
    if (cutoff === undefined || !plan.ordered.some(({ name }) => name === cutoff))
      return {
        adopted: [],
        problems: [{ code: "MIGRATION_ADOPTION_TARGET_UNKNOWN", name: through ?? "(none)" }],
      };

    const adopted: string[] = [];
    for (const file of plan.ordered) {
      if (file.name > cutoff) break;
      await ledger.adopt(file.name, migrationChecksum(file.sql));
      adopted.push(file.name);
    }
    return { adopted, problems: [] };
  });
}
