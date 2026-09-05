import {
  recordStoryDeliveryReconciliation,
  storyDeliveryReconciliationSchema,
  type StoryDeliveryReconciliation,
} from "@/domain/editorial";

export class PostgresStoryDeliveryReconciliationInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid persisted Story delivery reconciliation.");
    this.name = "PostgresStoryDeliveryReconciliationInvariantError";
  }
}

export function decodePostgresStoryDeliveryReconciliation(
  payload: unknown,
): StoryDeliveryReconciliation {
  const parsed = storyDeliveryReconciliationSchema.safeParse(payload);
  if (!parsed.success) throw new PostgresStoryDeliveryReconciliationInvariantError();
  const recorded = recordStoryDeliveryReconciliation(
    parsed.data as unknown as StoryDeliveryReconciliation,
  );
  if (!recorded.ok) throw new PostgresStoryDeliveryReconciliationInvariantError();
  return recorded.reconciliation;
}
