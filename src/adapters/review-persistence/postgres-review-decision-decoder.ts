import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

import { createReviewDecision, type ReviewDecision } from "@/domain/editorial";

export class PostgresReviewInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned invalid or impossible persisted review state.");
    this.name = "PostgresReviewInvariantError";
  }
}

const nonEmpty = z.string().refine((value) => value.trim().length > 0 && value === value.trim());
const schema = z
  .object({
    id: nonEmpty,
    storyId: nonEmpty,
    articleId: nonEmpty,
    revisionId: nonEmpty,
    directorRunId: nonEmpty,
    decision: z.enum(["approve", "request_changes"]),
    reason: nonEmpty,
    decidedBy: z.object({ type: z.literal("operator"), operatorId: nonEmpty }).strict(),
    decidedAt: nonEmpty,
  })
  .strict();

export function decodePostgresReviewDecision(row: {
  readonly decision_id: unknown;
  readonly story_id: unknown;
  readonly article_id: unknown;
  readonly revision_id: unknown;
  readonly director_run_id: unknown;
  readonly decision: unknown;
  readonly payload: unknown;
}): ReviewDecision {
  const parsed = schema.safeParse(row.payload);
  if (
    !parsed.success ||
    !isDeepStrictEqual(
      [
        row.decision_id,
        row.story_id,
        row.article_id,
        row.revision_id,
        row.director_run_id,
        row.decision,
      ],
      [
        parsed.data.id,
        parsed.data.storyId,
        parsed.data.articleId,
        parsed.data.revisionId,
        parsed.data.directorRunId,
        parsed.data.decision,
      ],
    )
  )
    throw new PostgresReviewInvariantError();
  const created = createReviewDecision(parsed.data as unknown as ReviewDecision);
  if (!created.ok) throw new PostgresReviewInvariantError();
  return created.decision;
}
