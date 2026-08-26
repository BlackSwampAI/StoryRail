import { z } from "zod";

import {
  actorSchema,
  markdownDocumentSchema,
  modelDescriptorSchema,
  nonEmptyText,
  presentText,
  versionedDescriptorSchema,
} from "./schema-primitives";
import { PREPARATION_FAILURE_CODES } from "./source-evidence-preparation-types";

/**
 * How much of the extracted text was put in front of the model. A submission larger than the
 * text it came from would mean the record is describing something other than what was read.
 */
const inputMeasurementSchema = z
  .object({
    rawCharacters: z.number().int().min(0),
    submittedCharacters: z.number().int().min(0),
  })
  .strict()
  .refine(({ rawCharacters, submittedCharacters }) => submittedCharacters <= rawCharacters);

const common = {
  id: nonEmptyText,
  sourceId: nonEmptyText,
  extractionId: nonEmptyText,
  model: modelDescriptorSchema,
  preparer: versionedDescriptorSchema,
  requestedBy: actorSchema,
  input: inputMeasurementSchema,
  startedAt: nonEmptyText,
  completedAt: nonEmptyText,
};

export const sourceEvidencePreparationSchema = z.union([
  z
    .object({
      ...common,
      outcome: z.literal("succeeded"),
      // Preparation that produced nothing readable is a failure wearing a success's shape.
      document: markdownDocumentSchema(presentText),
    })
    .strict(),
  z
    .object({
      ...common,
      outcome: z.literal("failed"),
      failure: z
        .object({ code: z.enum(PREPARATION_FAILURE_CODES), retryable: z.boolean() })
        .strict(),
    })
    .strict(),
]);
