// @vitest-environment node

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  AGENT_PROFILE_ROLES,
  AGENT_ROLES,
  ARTICLE_BLOCK_KINDS,
  CREDENTIAL_UNAVAILABLE_REASONS,
  DELIVERY_FAILURE_CODES,
  DELIVERY_OPERATIONS,
  DIRECTOR_CHECK_NAMES,
  DIRECTOR_CHECK_STATUSES,
  DIRECTOR_RECOMMENDATIONS,
  EVIDENCE_KINDS,
  GROUNDING_FAILURE_CODES,
  GROUNDING_REFUSAL_CODES,
  MODEL_FAILURE_CODES,
  REVIEW_DECISIONS,
  SITE_MODEL_ROLES,
  SOURCE_EXTRACTION_FAILURE_CODES,
  STORY_STATES,
  TOOL_FAILURE_CODES,
} from "@/domain/editorial";
import { describe, expect, it } from "vitest";

/**
 * Five times a domain enumeration was written out again outside the domain, and five times the
 * copy fell behind:
 *
 * - #93: which failure codes may carry grounding findings — three copies, two widened, one not,
 *   so every Story whose Writer went out of scope became unopenable.
 * - #100: `AGENT_ROLES` never gained `researcher`, so every Story with a Researcher run became
 *   unopenable, latent since #69.
 * - #104: the settings key list knew two of the four keys the shape had grown, and the whole
 *   settings screen went blank — models unreadable, stored credentials shown as absent.
 * - #105: `DIRECTOR_CHECK_NAMES` never gained `support`, so no Writer revision run validated at
 *   all and every Story that had been through a revision cycle was unopenable, latent since #66.
 * - #105: the persisted-run schema had no `corrected` on a Writer revision, so a revision that
 *   needed a correction turn could not be read back out of PostgreSQL at all.
 *
 * Each presented to the operator identically: the record was correct and the reader refused it.
 * This test is the cheap half of removing the pattern, and the half that keeps working after
 * everyone has forgotten why it exists. Import the constant; never type the members out.
 *
 * Test files are exempt: a fixture naming two values is stating a case, not describing a shape,
 * and it fails loudly the moment it is wrong.
 */
const ENUMERATIONS: Readonly<Record<string, readonly string[]>> = {
  AGENT_ROLES,
  AGENT_PROFILE_ROLES,
  ARTICLE_BLOCK_KINDS,
  CREDENTIAL_UNAVAILABLE_REASONS,
  DELIVERY_FAILURE_CODES,
  DELIVERY_OPERATIONS,
  DIRECTOR_CHECK_NAMES,
  DIRECTOR_CHECK_STATUSES,
  DIRECTOR_RECOMMENDATIONS,
  EVIDENCE_KINDS,
  GROUNDING_FAILURE_CODES,
  GROUNDING_REFUSAL_CODES,
  MODEL_FAILURE_CODES,
  REVIEW_DECISIONS,
  SITE_MODEL_ROLES,
  SOURCE_EXTRACTION_FAILURE_CODES,
  STORY_STATES,
  TOOL_FAILURE_CODES,
};

const WATCHED_DIRECTORIES = ["src/features", "src/adapters"];

/**
 * A deliberate subset is not a restatement: it names a rule about the enumeration rather than
 * claiming to be the enumeration. Each one is declared here so that the next person adding a
 * literal has to say which it is, and so a genuine drift cannot hide behind the exemption.
 *
 * Both entries below are the same rule — the states a Story may still be rejected from — stated
 * once for the screen and once for the query that enforces it. That they are two copies of one
 * subset is worth collapsing into the domain, but it is not this batch's concern.
 */
const DELIBERATE_SUBSETS: readonly string[] = [
  '["intake", "assigned", "in_progress", "in_review", "changes_requested"]',
  '[ "intake", "assigned", "in_progress", "in_review", "changes_requested", ]',
];

/** A bracketed list holding nothing but quoted strings — the shape a restatement takes. */
const STRING_LIST = /\[\s*"[^"\n]*"(?:\s*,\s*"[^"\n]*")*\s*,?\s*\]/g;

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

export function restatedEnumerations(
  path: string,
): readonly { readonly path: string; readonly enumeration: string; readonly literal: string }[] {
  const contents = readFileSync(path, "utf8");
  return (contents.match(STRING_LIST) ?? []).flatMap((literal) => {
    const members = [...literal.matchAll(/"([^"\n]*)"/g)].map(([, member]) => member);
    if (members.length < 2) return [];
    const enumeration = Object.entries(ENUMERATIONS).find(([, values]) =>
      members.every((member) => values.includes(member)),
    );
    const normalised = literal.replace(/\s+/g, " ");
    return enumeration === undefined || DELIBERATE_SUBSETS.includes(normalised)
      ? []
      : [{ path, enumeration: enumeration[0], literal: normalised }];
  });
}

describe("domain enumerations", () => {
  it("are imported by the readers outside the domain rather than written out again", () => {
    const restated = WATCHED_DIRECTORIES.flatMap((directory) =>
      sourceFiles(directory).flatMap(restatedEnumerations),
    );

    expect(restated).toEqual([]);
  });

  it("catches a literal planted where a reader should have imported the constant", () => {
    // The planted file is this test's own fixture rather than a real one, so the guard is proven
    // to fire without a drift having to be committed first.
    const planted = join("src", "test", "fixtures", "restated-enumeration.txt");
    expect(restatedEnumerations(planted)).toEqual([
      {
        path: planted,
        enumeration: "AGENT_ROLES",
        literal: '["assignment_editor", "writer", "editor_in_chief"]',
      },
    ]);
  });
});
