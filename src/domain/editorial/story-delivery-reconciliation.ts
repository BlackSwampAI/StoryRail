import type {
  RecordStoryDeliveryReconciliationResult,
  StoryDeliveryReconciliation,
} from "./story-delivery-reconciliation-types";

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value === value.trim();

export function recordStoryDeliveryReconciliation(
  candidate: StoryDeliveryReconciliation,
): RecordStoryDeliveryReconciliationResult {
  if (
    !nonEmpty(candidate.id) ||
    !nonEmpty(candidate.storyId) ||
    !nonEmpty(candidate.deliveryId) ||
    !nonEmpty(candidate.destination) ||
    !nonEmpty(candidate.destinationInstanceId) ||
    !nonEmpty(candidate.slug) ||
    !nonEmpty(candidate.decidedAt) ||
    (candidate.operation !== "create" && candidate.operation !== "update")
  )
    return {
      ok: false,
      error: {
        code: "STORY_DELIVERY_RECONCILIATION_IDENTITY_INVALID",
        message:
          "Reconciliation identities, destination snapshot, operation, slug, and time are required.",
      },
    };
  if (
    (candidate.decision !== "delivered" && candidate.decision !== "not_delivered") ||
    (candidate.decision === "delivered"
      ? !nonEmpty(candidate.remoteId)
      : candidate.remoteId !== null)
  )
    return {
      ok: false,
      error: {
        code: "STORY_DELIVERY_RECONCILIATION_DECISION_INVALID",
        message: "A delivered decision names the remote page; a not-delivered decision does not.",
      },
    };
  if (candidate.decidedBy.type !== "operator" || !nonEmpty(candidate.decidedBy.operatorId))
    return {
      ok: false,
      error: {
        code: "STORY_DELIVERY_RECONCILIATION_OPERATOR_REQUIRED",
        message: "A delivery reconciliation must be owned by an operator.",
      },
    };
  return { ok: true, reconciliation: structuredClone(candidate) };
}
