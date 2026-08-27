import { z } from "zod";

import {
  DELIVERY_FAILURE_CODES,
  DELIVERY_OPERATIONS,
  recordStoryDelivery,
  type StoryDelivery,
} from "@/domain/editorial";

export class PostgresStoryDeliveryInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid or impossible persisted Story delivery.");
    this.name = "PostgresStoryDeliveryInvariantError";
  }
}

const nonEmpty = z.string().refine((value) => value.trim().length > 0);
const deliverySchema = z
  .object({
    id: nonEmpty,
    storyId: nonEmpty,
    revisionId: nonEmpty,
    destination: nonEmpty,
    remoteId: nonEmpty.nullable(),
    request: z
      .object({
        operation: z.enum(DELIVERY_OPERATIONS),
        slug: nonEmpty,
        draft: z.boolean(),
        bodyCharacters: z.number().int().min(0),
      })
      .strict(),
    startedAt: nonEmpty,
  })
  .and(
    z.union([
      z.object({ outcome: z.literal("running"), completedAt: z.null() }),
      z.object({
        outcome: z.literal("succeeded"),
        completedAt: nonEmpty,
        result: z
          .object({
            status: z.number().int(),
            message: nonEmpty.nullable(),
            // Present only on a delivery whose destination renamed the page, so both are
            // optional and the domain refuses one without the other.
            requestedSlug: nonEmpty.optional(),
            assignedSlug: nonEmpty.optional(),
          })
          .strict(),
      }),
      z.object({
        outcome: z.literal("failed"),
        completedAt: nonEmpty,
        failure: z
          .object({ code: z.enum(DELIVERY_FAILURE_CODES), message: nonEmpty.nullable() })
          .strict(),
      }),
    ]),
  );

/**
 * One decoder for every read of a persisted delivery.
 *
 * Story inspection reads the same rows the delivery repository writes, and a second decoder
 * written beside it would be a second opinion on what a valid record is — the drift that made a
 * correctly recorded agent run unreadable to the browser.
 */
export function decodePostgresStoryDelivery(
  payload: unknown,
  invariantError: () => Error = () => new PostgresStoryDeliveryInvariantError(),
): StoryDelivery {
  const parsed = deliverySchema.safeParse(payload);
  if (!parsed.success) throw invariantError();
  const recorded = recordStoryDelivery(parsed.data as unknown as StoryDelivery);
  if (!recorded.ok) throw invariantError();
  return recorded.delivery;
}
