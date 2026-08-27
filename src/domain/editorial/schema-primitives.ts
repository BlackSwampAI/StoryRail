import { z } from "zod";

import { EVIDENCE_KINDS } from "./agent-run-types";
import { AGENT_ROLES, STORY_STATES } from "./types";

/**
 * The pieces every editorial record is built from, described once so that the database reader and
 * the browser reader can share a description instead of each keeping an opinion.
 *
 * The schemas here and in the files beside them are pure: they perform no I/O and reach for no
 * framework, so the same module that decodes a PostgreSQL payload runs unchanged in a browser
 * bundle. That is what makes one account of a record possible rather than merely desirable.
 */
export const nonEmptyText = z
  .string()
  .refine((value) => value.trim().length > 0 && value === value.trim());

/** Text a record may hold verbatim, including whitespace an operator would not have chosen. */
export const presentText = z.string().refine((value) => value.trim().length > 0);

/**
 * Every object schema is closed. An unexpected key is refused rather than dropped, because a
 * record carrying a field this account does not know about is a record written by something that
 * disagrees about what the shape is, and reading it anyway is how the disagreement stays hidden.
 */
export const operatorActorSchema = z
  .object({ type: z.literal("operator"), operatorId: nonEmptyText })
  .strict();

export const actorSchema = z.discriminatedUnion("type", [
  operatorActorSchema,
  z.object({ type: z.literal("agent"), role: z.enum(AGENT_ROLES), runId: nonEmptyText }).strict(),
]);

export const modelDescriptorSchema = z
  .object({ provider: nonEmptyText, model: nonEmptyText })
  .strict();

/** What produced a record and which version of it did, as extractors and prompts both report. */
export const versionedDescriptorSchema = z
  .object({ key: nonEmptyText, version: nonEmptyText })
  .strict();

export const evidenceReferenceSchema = z
  .object({
    sourceId: nonEmptyText,
    relevance: nonEmptyText,
    evidenceKind: z.enum(EVIDENCE_KINDS),
    evidenceId: nonEmptyText,
  })
  .strict();

export const storySnapshotSchema = z
  .object({
    id: nonEmptyText,
    title: nonEmptyText,
    state: z.enum(STORY_STATES),
    revisionCycle: z.number().int().min(0).max(2),
  })
  .strict();

/**
 * A retrieved document, whose body is checked only for being a string.
 *
 * Extraction keeps whatever the page gave it, spacing and all, because the grounding check
 * quotes against exactly that text; a schema that trimmed it would move a passage out from
 * under a citation that had already been verified.
 */
export function markdownDocumentSchema(content: z.ZodType<string>) {
  return z
    .object({
      format: z.literal("markdown"),
      content,
      title: z.string().nullable(),
      byline: z.string().nullable(),
      publishedAt: z.string().nullable(),
      language: z.string().nullable(),
    })
    .strict();
}
