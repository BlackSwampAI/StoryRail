import { z } from "zod";

import { ARTICLE_BLOCK_KINDS } from "./article-types";
import { nonEmptyText } from "./schema-primitives";

export const articleCitationSchema = z
  .object({ sourceId: nonEmptyText, evidenceId: nonEmptyText, quote: nonEmptyText })
  .strict();

export const articleBlockSchema = z
  .object({
    kind: z.enum(ARTICLE_BLOCK_KINDS),
    markdown: nonEmptyText,
    citations: z.array(articleCitationSchema),
  })
  .strict();

export const articleSchema = z
  .object({
    id: nonEmptyText,
    storyId: nonEmptyText,
    assignmentId: nonEmptyText,
    createdAt: nonEmptyText,
  })
  .strict();

export const articleRevisionSchema = z
  .object({
    id: nonEmptyText,
    articleId: nonEmptyText,
    revisionNumber: z.number().int().min(1).max(3),
    writerProfileId: nonEmptyText,
    agentRunId: nonEmptyText,
    headline: nonEmptyText,
    dek: nonEmptyText.nullable(),
    blocks: z.array(articleBlockSchema).min(1),
    // Only a Writer run produces a Revision, and it says which run it was.
    createdBy: z
      .object({ type: z.literal("agent"), role: z.literal("writer"), runId: nonEmptyText })
      .strict(),
    createdAt: nonEmptyText,
  })
  .strict();
