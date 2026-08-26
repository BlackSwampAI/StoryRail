import { z } from "zod";

import {
  actorSchema,
  markdownDocumentSchema,
  nonEmptyText,
  versionedDescriptorSchema,
} from "./schema-primitives";
import { SOURCE_EXTRACTION_FAILURE_CODES } from "./source-extraction-types";

const common = {
  id: nonEmptyText,
  sourceId: nonEmptyText,
  extractor: versionedDescriptorSchema,
  requestedBy: actorSchema,
  startedAt: nonEmptyText,
  completedAt: nonEmptyText,
};

export const sourceExtractionSchema = z.union([
  z
    .object({
      ...common,
      outcome: z.literal("succeeded"),
      document: markdownDocumentSchema(z.string()),
    })
    .strict(),
  z
    .object({
      ...common,
      outcome: z.literal("failed"),
      failure: z
        .object({
          code: z.enum(SOURCE_EXTRACTION_FAILURE_CODES),
          retryable: z.boolean(),
        })
        .strict(),
    })
    .strict(),
]);
