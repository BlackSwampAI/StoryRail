import { z } from "zod";

import { TOOL_FAILURE_CODES } from "./agent-tool-call-types";
import { nonEmptyText } from "./schema-primitives";

const common = {
  id: nonEmptyText,
  runId: nonEmptyText,
  storyId: nonEmptyText,
  sequence: z.number().int().min(1),
  tool: nonEmptyText,
  // Which tools exist is an operator's decision, so the request is recorded as it was sent
  // rather than checked against a list this account would have to be told about.
  request: z.record(z.string(), z.unknown()),
  requestedAt: nonEmptyText,
};

export const agentToolCallSchema = z.union([
  z.object({ ...common, outcome: z.literal("running"), completedAt: z.null() }).strict(),
  z
    .object({
      ...common,
      outcome: z.literal("succeeded"),
      completedAt: nonEmptyText,
      result: z.unknown(),
    })
    .strict(),
  z
    .object({
      ...common,
      outcome: z.literal("failed"),
      completedAt: nonEmptyText,
      failure: z
        .object({
          code: z.enum(TOOL_FAILURE_CODES),
          retryable: z.boolean(),
          message: nonEmptyText.nullable(),
        })
        .strict(),
    })
    .strict(),
]);
