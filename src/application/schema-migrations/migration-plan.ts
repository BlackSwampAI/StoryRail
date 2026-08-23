import { createHash } from "node:crypto";

/**
 * Deliberately free of the `@/` path alias, here and in everything it imports. This module is
 * reached from a plain `node` CLI as well as from the bundler, and the alias only exists inside
 * the bundler. A migration you cannot run without starting the app is not much use.
 */

/** Four digits, a hyphen, and a lower-case name. The digits order the file; gaps are expected. */
export const MIGRATION_NAME_PATTERN = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/;

export interface MigrationFile {
  readonly name: string;
  readonly sql: string;
}

/**
 * `applied` means this runner ran the file. `adopted` means the database was already carrying the
 * change when the ledger was introduced, and the runner is taking the operator's word for it. The
 * two are kept apart because the runner can vouch for one and not the other.
 */
export type MigrationStatus = "running" | "applied" | "adopted";

export interface AppliedMigration {
  readonly name: string;
  readonly checksum: string;
  readonly status: MigrationStatus;
}

export type MigrationProblem =
  /** A file whose name cannot be ordered, so its place in the sequence is unknowable. */
  | { readonly code: "MIGRATION_NAME_INVALID"; readonly name: string }
  /** Two files claiming the same position, which is what a merge of two branches produces. */
  | {
      readonly code: "MIGRATION_NUMBER_REUSED";
      readonly number: string;
      readonly names: readonly string[];
    }
  /** A migration that started and never reported finishing. Nobody can say whether it committed. */
  | { readonly code: "MIGRATION_IN_DOUBT"; readonly name: string }
  /** The file changed after it was applied, so the ledger no longer describes this database. */
  | {
      readonly code: "MIGRATION_CHANGED_AFTER_APPLYING";
      readonly name: string;
      readonly appliedChecksum: string;
      readonly currentChecksum: string;
    }
  /** The database ran something this checkout does not contain. */
  | { readonly code: "MIGRATION_APPLIED_BUT_ABSENT"; readonly name: string }
  /** A pending migration that sorts before one already applied. */
  | {
      readonly code: "MIGRATION_OUT_OF_ORDER";
      readonly name: string;
      readonly appliedThrough: string;
    }
  /** The schema is already here but no ledger describes it. Only an operator can vouch for it. */
  | { readonly code: "MIGRATION_LEDGER_MISSING" }
  /** Adoption was asked to stop at a migration this checkout does not contain. */
  | { readonly code: "MIGRATION_ADOPTION_TARGET_UNKNOWN"; readonly name: string };

export interface MigrationPlan {
  readonly ordered: readonly MigrationFile[];
  readonly pending: readonly MigrationFile[];
  readonly problems: readonly MigrationProblem[];
}

/** The file exactly as it is on disk. Any edit to an applied migration changes this. */
export function migrationChecksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

function settled(status: MigrationStatus): boolean {
  return status === "applied" || status === "adopted";
}

/**
 * What this database still needs, and every reason it might not be safe to give it.
 *
 * Nothing here decides to run anything. It reads a directory of files against a ledger of what a
 * database says it has, and reports both the work and the contradictions. A runner that found a
 * contradiction and carried on would be guessing about the shape of a schema it is about to
 * change, which is the failure this whole batch exists to remove.
 */
export function planMigrations(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
): MigrationPlan {
  const problems: MigrationProblem[] = [];

  const named = files.filter((file) => {
    if (MIGRATION_NAME_PATTERN.test(file.name)) return true;
    problems.push({ code: "MIGRATION_NAME_INVALID", name: file.name });
    return false;
  });

  // Zero-padded numbers sort correctly as text, so the file name is the ordering.
  const ordered = [...named].sort((left, right) => (left.name < right.name ? -1 : 1));

  const byNumber = new Map<string, string[]>();
  for (const file of ordered) {
    const number = file.name.slice(0, 4);
    byNumber.set(number, [...(byNumber.get(number) ?? []), file.name]);
  }
  for (const [number, names] of byNumber)
    if (names.length > 1) problems.push({ code: "MIGRATION_NUMBER_REUSED", number, names });

  const ledger = new Map(applied.map((record) => [record.name, record]));
  const present = new Set(ordered.map((file) => file.name));
  for (const record of applied) {
    if (record.status === "running")
      problems.push({ code: "MIGRATION_IN_DOUBT", name: record.name });
    if (!present.has(record.name) && settled(record.status))
      problems.push({ code: "MIGRATION_APPLIED_BUT_ABSENT", name: record.name });
  }

  const pending: MigrationFile[] = [];
  for (const file of ordered) {
    const record = ledger.get(file.name);
    if (record === undefined) {
      pending.push(file);
      continue;
    }
    if (!settled(record.status)) continue;
    const current = migrationChecksum(file.sql);
    if (record.checksum !== current)
      problems.push({
        code: "MIGRATION_CHANGED_AFTER_APPLYING",
        name: file.name,
        appliedChecksum: record.checksum,
        currentChecksum: current,
      });
  }

  // A migration that sorts before work already done cannot simply be run late: everything after
  // it was written against a schema that did not include it. Two branches that both took the
  // next free number produce exactly this, and renumbering the unapplied one is the fix.
  const appliedThrough = ordered
    .filter((file) => settled(ledger.get(file.name)?.status ?? "running"))
    .at(-1)?.name;
  if (appliedThrough !== undefined)
    for (const file of pending)
      if (file.name < appliedThrough)
        problems.push({ code: "MIGRATION_OUT_OF_ORDER", name: file.name, appliedThrough });

  return { ordered, pending, problems };
}
