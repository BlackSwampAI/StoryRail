import { z } from "zod";

import { GROUNDING_FAILURE_CODES } from "./article-grounding";
import { directorReviewSchema } from "./director-review-schema";
import { REVIEW_DECISIONS } from "./review-decision-types";
import {
  actorSchema,
  evidenceReferenceSchema,
  modelDescriptorSchema,
  nonEmptyText,
  operatorActorSchema,
  storySnapshotSchema,
  versionedDescriptorSchema,
} from "./schema-primitives";
import { MODEL_FAILURE_CODES } from "./source-evidence-preparation-types";

export const groundingFindingSchema = z
  .object({
    blockIndex: z.number().int().min(0),
    citationIndex: z.number().int().min(0),
    code: z.enum(GROUNDING_FAILURE_CODES),
    quote: nonEmptyText,
    evidenceId: nonEmptyText,
  })
  .strict();

/**
 * Which failures may carry findings, and which may carry unsupported checks, is decided by
 * `recordAgentRun` rather than restated here. A shape that is well formed but attaches findings
 * to a failure that is not about grounding is refused by the domain that writes the record, so
 * this schema describes the shape and lets that one rule stay in one place.
 */
export const modelFailureSchema = z
  .object({
    code: z.enum(MODEL_FAILURE_CODES),
    retryable: z.boolean(),
    findings: z.array(groundingFindingSchema).min(1).optional(),
    unsupportedChecks: z.array(nonEmptyText).min(1).optional(),
  })
  .strict();

const evidence = z.array(evidenceReferenceSchema).min(1);

const assignmentSnapshot = z
  .object({
    id: nonEmptyText,
    storyId: nonEmptyText,
    writerProfileId: nonEmptyText,
    sourceIds: z.array(nonEmptyText).min(1),
    angle: nonEmptyText,
    brief: nonEmptyText,
    constraints: nonEmptyText.nullable(),
  })
  .strict();

const articleSnapshot = z.object({ id: nonEmptyText, assignmentId: nonEmptyText }).strict();

const revisionSnapshot = z
  .object({
    id: nonEmptyText,
    articleId: nonEmptyText,
    revisionNumber: z.number().int().min(1).max(3),
    writerProfileId: nonEmptyText,
    agentRunId: nonEmptyText,
    headline: nonEmptyText,
    dek: nonEmptyText.nullable(),
    bodyMarkdown: nonEmptyText,
  })
  .strict();

const assignmentInput = z
  .object({
    story: storySnapshotSchema,
    evidence,
    unavailableSourceIds: z.array(nonEmptyText),
    writerProfileIds: z.array(nonEmptyText).min(1),
  })
  .strict();

const researchInput = z
  .object({
    story: storySnapshotSchema,
    evidence,
    unavailableSourceIds: z.array(nonEmptyText),
  })
  .strict();

const writerInput = z
  .object({
    story: storySnapshotSchema,
    assignment: assignmentSnapshot,
    evidence,
    unavailableSourceIds: z.array(nonEmptyText),
  })
  .strict();

const revisionInput = writerInput.extend({
  article: articleSnapshot,
  revision: revisionSnapshot,
  directorReview: directorReviewSchema,
  reviewDecision: z
    .object({
      id: nonEmptyText,
      storyId: nonEmptyText,
      articleId: nonEmptyText,
      revisionId: nonEmptyText,
      directorRunId: nonEmptyText,
      decision: z.enum(REVIEW_DECISIONS),
      reason: nonEmptyText,
      decidedBy: operatorActorSchema,
      decidedAt: nonEmptyText,
    })
    .strict(),
});

const directorInput = z
  .object({
    story: storySnapshotSchema,
    assignment: assignmentSnapshot,
    article: articleSnapshot,
    revision: revisionSnapshot,
    evidence,
    unavailableSourceIds: z.array(nonEmptyText),
  })
  .strict();

const shared = {
  id: nonEmptyText,
  storyId: nonEmptyText,
  profileId: nonEmptyText,
  model: modelDescriptorSchema,
  prompt: versionedDescriptorSchema,
  requestedBy: actorSchema,
  startedAt: nonEmptyText,
};
/** A run still in flight has no completion timestamp; a finished one must record when. */
const inFlight = { completedAt: z.null() };
const completed = { completedAt: nonEmptyText };

const assignmentCommon = {
  ...shared,
  role: z.literal("assignment_editor"),
  operation: z.literal("assignment_proposal"),
  input: assignmentInput,
};
const researcherCommon = {
  ...shared,
  role: z.literal("researcher"),
  operation: z.literal("source_research"),
  input: researchInput,
};
const draftCommon = {
  ...shared,
  role: z.literal("writer"),
  operation: z.literal("article_draft"),
  input: writerInput,
};
const revisionCommon = {
  ...shared,
  role: z.literal("writer"),
  operation: z.literal("article_revision"),
  input: revisionInput,
};
const directorCommon = {
  ...shared,
  role: z.literal("editor_in_chief"),
  operation: z.literal("article_review"),
  input: directorInput,
};

/**
 * One account of a supervised run, read by the database and by the browser alike.
 *
 * Every role and outcome is spelled out as its own member rather than as one loose shape with
 * optional fields, because the fields are not optional: a succeeded Director run always carries
 * a review and a running one never does. A validator written by hand can omit a role entirely
 * and nothing notices — that is exactly what happened when the Researcher was added — and a
 * union enumerated from the domain's own discriminants cannot.
 */
export const agentRunSchema = z.union([
  z.object({ ...assignmentCommon, ...inFlight, outcome: z.literal("running") }).strict(),
  z
    .object({
      ...assignmentCommon,
      ...completed,
      outcome: z.literal("succeeded"),
      proposal: z
        .object({
          writerProfileId: nonEmptyText,
          angle: nonEmptyText,
          brief: nonEmptyText,
          constraints: nonEmptyText.nullable(),
          reason: nonEmptyText,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...assignmentCommon,
      ...completed,
      outcome: z.literal("failed"),
      failure: modelFailureSchema,
    })
    .strict(),
  z.object({ ...researcherCommon, ...inFlight, outcome: z.literal("running") }).strict(),
  z
    .object({
      ...researcherCommon,
      ...completed,
      outcome: z.literal("succeeded"),
      // Attaching nothing is a real answer, so an empty list is a complete run.
      attached: z.array(
        z.object({ sourceId: nonEmptyText, url: nonEmptyText, relevance: nonEmptyText }).strict(),
      ),
    })
    .strict(),
  z
    .object({
      ...researcherCommon,
      ...completed,
      outcome: z.literal("failed"),
      failure: modelFailureSchema,
    })
    .strict(),
  z.object({ ...draftCommon, ...inFlight, outcome: z.literal("running") }).strict(),
  z
    .object({
      ...draftCommon,
      ...completed,
      outcome: z.literal("succeeded"),
      articleId: nonEmptyText,
      revisionId: nonEmptyText,
      // Present only where the Writer had to be told which citations were wrong.
      corrected: z.array(groundingFindingSchema).min(1).optional(),
    })
    .strict(),
  z
    .object({
      ...draftCommon,
      ...completed,
      outcome: z.literal("failed"),
      failure: modelFailureSchema,
    })
    .strict(),
  z.object({ ...revisionCommon, ...inFlight, outcome: z.literal("running") }).strict(),
  z
    .object({
      ...revisionCommon,
      ...completed,
      outcome: z.literal("succeeded"),
      articleId: nonEmptyText,
      revisionId: nonEmptyText,
      corrected: z.array(groundingFindingSchema).min(1).optional(),
    })
    .strict(),
  z
    .object({
      ...revisionCommon,
      ...completed,
      outcome: z.literal("failed"),
      failure: modelFailureSchema,
    })
    .strict(),
  z.object({ ...directorCommon, ...inFlight, outcome: z.literal("running") }).strict(),
  z
    .object({
      ...directorCommon,
      ...completed,
      outcome: z.literal("succeeded"),
      review: directorReviewSchema,
    })
    .strict(),
  z
    .object({
      ...directorCommon,
      ...completed,
      outcome: z.literal("failed"),
      failure: modelFailureSchema,
    })
    .strict(),
]);
