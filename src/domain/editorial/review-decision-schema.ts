import { z } from "zod";

import { REVIEW_DECISIONS } from "./review-decision-types";
import { nonEmptyText, operatorActorSchema } from "./schema-primitives";

export const reviewDecisionSchema = z
  .object({
    id: nonEmptyText,
    storyId: nonEmptyText,
    articleId: nonEmptyText,
    revisionId: nonEmptyText,
    directorRunId: nonEmptyText,
    decision: z.enum(REVIEW_DECISIONS),
    reason: nonEmptyText,
    // Only a person decides. The Director recommends, and the record keeps the two apart.
    decidedBy: operatorActorSchema,
    decidedAt: nonEmptyText,
  })
  .strict();
