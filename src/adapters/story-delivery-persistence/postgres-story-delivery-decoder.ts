import { recordStoryDelivery, storyDeliverySchema, type StoryDelivery } from "@/domain/editorial";

export class PostgresStoryDeliveryInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid or impossible persisted Story delivery.");
    this.name = "PostgresStoryDeliveryInvariantError";
  }
}

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
  const parsed = storyDeliverySchema.safeParse(payload);
  if (!parsed.success) throw invariantError();
  const recorded = recordStoryDelivery(parsed.data as unknown as StoryDelivery);
  if (!recorded.ok) throw invariantError();
  return recorded.delivery;
}
