import { describe, expect, it } from "vitest";

import {
  migrationChecksum,
  planMigrations,
  type AppliedMigration,
  type MigrationFile,
} from "./migration-plan.ts";

function file(name: string, sql = `-- ${name}`): MigrationFile {
  return { name, sql };
}

function record(
  file: MigrationFile,
  status: AppliedMigration["status"] = "applied",
): AppliedMigration {
  return { name: file.name, checksum: migrationChecksum(file.sql), status };
}

describe("planning what a database still needs", () => {
  it("orders by the numeric prefix and tolerates gaps in it", () => {
    const plan = planMigrations([file("0064-late.sql"), file("0012-first.sql")], []);

    expect(plan.ordered.map(({ name }) => name)).toEqual(["0012-first.sql", "0064-late.sql"]);
    expect(plan.pending.map(({ name }) => name)).toEqual(["0012-first.sql", "0064-late.sql"]);
    expect(plan.problems).toEqual([]);
  });

  it("treats an applied migration as done and leaves the rest pending", () => {
    const first = file("0012-first.sql");
    const plan = planMigrations([first, file("0064-late.sql")], [record(first)]);

    expect(plan.pending.map(({ name }) => name)).toEqual(["0064-late.sql"]);
    expect(plan.problems).toEqual([]);
  });

  it("counts an adopted migration as done without having run it", () => {
    const first = file("0012-first.sql");
    const plan = planMigrations([first], [record(first, "adopted")]);

    expect(plan.pending).toEqual([]);
    expect(plan.problems).toEqual([]);
  });

  it("reports a migration that started and never reported finishing", () => {
    const first = file("0012-first.sql");
    const plan = planMigrations([first], [record(first, "running")]);

    expect(plan.problems).toContainEqual({ code: "MIGRATION_IN_DOUBT", name: "0012-first.sql" });
    // Nobody can say whether it committed, so it is neither done nor safely repeatable.
    expect(plan.pending).toEqual([]);
  });

  it("reports a file that changed after it was applied", () => {
    const first = file("0012-first.sql", "CREATE TABLE a ();");
    const plan = planMigrations([file("0012-first.sql", "CREATE TABLE b ();")], [record(first)]);

    expect(plan.problems).toContainEqual(
      expect.objectContaining({
        code: "MIGRATION_CHANGED_AFTER_APPLYING",
        name: "0012-first.sql",
      }),
    );
  });

  it("reports a migration the database ran that this checkout does not have", () => {
    const plan = planMigrations([], [record(file("0099-from-another-branch.sql"))]);

    expect(plan.problems).toContainEqual({
      code: "MIGRATION_APPLIED_BUT_ABSENT",
      name: "0099-from-another-branch.sql",
    });
  });

  it("reports two files that took the same number, as a branch merge produces", () => {
    const plan = planMigrations([file("0065-mine.sql"), file("0065-yours.sql")], []);

    expect(plan.problems).toContainEqual({
      code: "MIGRATION_NUMBER_REUSED",
      number: "0065",
      names: ["0065-mine.sql", "0065-yours.sql"],
    });
  });

  it("refuses to slip a migration in behind work already applied", () => {
    const late = file("0064-late.sql");
    const plan = planMigrations([file("0063-arrived-later.sql"), late], [record(late)]);

    expect(plan.problems).toContainEqual({
      code: "MIGRATION_OUT_OF_ORDER",
      name: "0063-arrived-later.sql",
      appliedThrough: "0064-late.sql",
    });
  });

  it("does not call a migration out of order when nothing has been applied", () => {
    const plan = planMigrations([file("0012-first.sql"), file("0064-late.sql")], []);

    expect(plan.problems).toEqual([]);
  });

  it("excludes a file whose name cannot be ordered rather than guessing its place", () => {
    const plan = planMigrations([file("notes.sql"), file("0012-first.sql")], []);

    expect(plan.problems).toContainEqual({ code: "MIGRATION_NAME_INVALID", name: "notes.sql" });
    expect(plan.ordered.map(({ name }) => name)).toEqual(["0012-first.sql"]);
    expect(plan.pending.map(({ name }) => name)).toEqual(["0012-first.sql"]);
  });

  it("changes the checksum when a single character of the file changes", () => {
    expect(migrationChecksum("SELECT 1;")).not.toBe(migrationChecksum("SELECT 2;"));
    expect(migrationChecksum("SELECT 1;")).toBe(migrationChecksum("SELECT 1;"));
  });
});
