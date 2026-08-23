import { resolve } from "node:path";
import { Pool } from "pg";

import {
  adoptMigrations,
  applyMigrations,
  createPostgresMigrationLedger,
  inspectMigrations,
  readMigrationDirectory,
} from "../src/adapters/schema-migrations/index.ts";
import type { MigrationProblem } from "../src/application/schema-migrations/index.ts";

/**
 * StoryRail's migration runner.
 *
 * Migrations are still plain SQL files applied to a database; what changes is that the database
 * now says which ones it has, and this refuses to touch a schema it cannot describe.
 */

const USAGE = `Usage: pnpm migrate <status|up|adopt> [--through <migration>]

  status   Report what this database has, what it still needs, and anything contradictory.
  up       Apply every pending migration, in order.
  adopt    Record migrations as already present without running them, for a database that
           predates this ledger. Use --through to name the last migration you know was applied;
           the default is every migration in this checkout.

STORYRAIL_DATABASE_URL must be set.`;

function describe(problem: MigrationProblem): string {
  switch (problem.code) {
    case "MIGRATION_NAME_INVALID":
      return `${problem.name} is not named NNNN-lower-case-name.sql, so its place in the sequence is unknowable.`;
    case "MIGRATION_NUMBER_REUSED":
      return `Number ${problem.number} is claimed by ${problem.names.join(" and ")}. Renumber the one that has not been applied.`;
    case "MIGRATION_IN_DOUBT":
      return `${problem.name} started and never reported finishing. Check whether it committed, then complete or remove its row in public.storyrail_schema_migrations by hand.`;
    case "MIGRATION_CHANGED_AFTER_APPLYING":
      return `${problem.name} changed after it was applied (${problem.appliedChecksum.slice(0, 12)} -> ${problem.currentChecksum.slice(0, 12)}). An applied migration is history; write a new one instead.`;
    case "MIGRATION_APPLIED_BUT_ABSENT":
      return `This database applied ${problem.name}, which this checkout does not contain. You are probably on an older commit than the database.`;
    case "MIGRATION_OUT_OF_ORDER":
      return `${problem.name} sorts before ${problem.appliedThrough}, which is already applied. Renumber it above ${problem.appliedThrough}.`;
    case "MIGRATION_LEDGER_MISSING":
      return "This database already has the storyrail schema but no record of which migrations produced it. Run `pnpm migrate adopt --through <the last one you applied>` to say what is already there.";
    case "MIGRATION_ADOPTION_TARGET_UNKNOWN":
      return `There is no migration named ${problem.name} in this checkout to adopt through.`;
  }
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function main(): Promise<number> {
  const command = process.argv[2];
  if (command !== "status" && command !== "up" && command !== "adopt") {
    console.error(USAGE);
    return 2;
  }
  const databaseUrl = process.env.STORYRAIL_DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("STORYRAIL_DATABASE_URL is required.");
    return 2;
  }

  const files = await readMigrationDirectory(resolve(process.cwd(), "database/migrations"));
  const pool = new Pool({ connectionString: databaseUrl });
  const ledger = await createPostgresMigrationLedger(pool);
  try {
    if (command === "status") {
      const report = await inspectMigrations(ledger, files);
      console.log(`${files.length} migrations in this checkout.`);
      console.log(`${report.applied.length} applied, ${report.adopted.length} adopted.`);
      console.log(
        report.pending.length === 0
          ? "Nothing pending; this database is current."
          : `${report.pending.length} pending:\n  ${report.pending.join("\n  ")}`,
      );
      const problems = report.unledgered
        ? [...report.problems, { code: "MIGRATION_LEDGER_MISSING" } as MigrationProblem]
        : report.problems;
      for (const problem of problems) console.error(`\n! ${describe(problem)}`);
      return problems.length === 0 ? 0 : 1;
    }

    if (command === "adopt") {
      const result = await adoptMigrations(ledger, files, argument("--through"));
      for (const problem of result.problems) console.error(`! ${describe(problem)}`);
      if (result.problems.length > 0) return 1;
      console.log(`Adopted ${result.adopted.length} migrations as already present.`);
      console.log("Nothing was run. Use `pnpm migrate status` to see what is still pending.");
      return 0;
    }

    const report = await applyMigrations(ledger, files);
    for (const name of report.applied) console.log(`applied ${name}`);
    for (const problem of report.problems) console.error(`! ${describe(problem)}`);
    if (report.failed !== null)
      console.error(
        `\n! ${report.failed.name} failed: ${report.failed.message}\n` +
          "Its ledger row is left saying it was running. Check whether it committed before rerunning.",
      );
    if (report.problems.length === 0 && report.failed === null && report.applied.length === 0)
      console.log("Nothing pending; this database is current.");
    return report.problems.length === 0 && report.failed === null ? 0 : 1;
  } finally {
    await ledger.release();
    await pool.end();
  }
}

process.exitCode = await main();
