import { z } from "zod";

import { nonEmptyText } from "./schema-primitives";
import {
  DELIVERY_FAILURE_CODES,
  DELIVERY_OPERATIONS,
  DELIVERY_UNCERTAINTY_CODES,
} from "./story-delivery-types";

const common = {
  id: nonEmptyText,
  storyId: nonEmptyText,
  revisionId: nonEmptyText,
  destination: nonEmptyText,
  destinationInstanceId: nonEmptyText.nullable(),
  // A delivery still in flight has not been told the identifier the destination assigned.
  remoteId: nonEmptyText.nullable(),
  request: z
    .object({
      operation: z.enum(DELIVERY_OPERATIONS),
      slug: nonEmptyText,
      draft: z.boolean(),
      bodyCharacters: z.number().int().min(0),
    })
    .strict(),
  startedAt: nonEmptyText,
};

export const storyDeliverySchema = z.union([
  z.object({ ...common, outcome: z.literal("running"), completedAt: z.null() }).strict(),
  z
    .object({
      ...common,
      outcome: z.literal("succeeded"),
      completedAt: nonEmptyText,
      result: z
        .object({
          status: z.number().int(),
          message: nonEmptyText.nullable(),
          // Present only where the destination renamed the page. The domain refuses one
          // without the other, because half the pair cannot say where the page went.
          requestedSlug: nonEmptyText.optional(),
          assignedSlug: nonEmptyText.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      outcome: z.literal("failed"),
      completedAt: nonEmptyText,
      failure: z
        .object({ code: z.enum(DELIVERY_FAILURE_CODES), message: nonEmptyText.nullable() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      outcome: z.literal("unknown"),
      completedAt: nonEmptyText,
      uncertainty: z
        .object({ code: z.enum(DELIVERY_UNCERTAINTY_CODES), message: nonEmptyText.nullable() })
        .strict(),
    })
    .strict(),
]);
