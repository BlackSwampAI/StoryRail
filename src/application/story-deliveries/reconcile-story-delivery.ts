import {
  recordStoryDeliveryReconciliation,
  type CredentialUnavailableError,
  type DestinationInstanceId,
  type OperatorActor,
  type StoryDeliveryId,
  type StoryDeliveryReconciliation,
  type StoryDeliveryReconciliationDecision,
  type StoryDeliveryReconciliationId,
  type StoryId,
} from "@/domain/editorial";
import type { StoryInspectionRepository } from "@/application/story-inspection";

import type { DeliveryDestinationDirectory } from "./delivery-destination";
import type { StoryDeliveryReconciliationRepository } from "./story-delivery-reconciliation-repository";
import type { StoryDeliveryRepository } from "./story-delivery-repository";

export type ReconcileStoryDeliveryResult =
  | { readonly ok: true; readonly reconciliation: StoryDeliveryReconciliation }
  | {
      readonly ok: false;
      readonly error:
        | {
            readonly code:
              | "STORY_DELIVERY_RECONCILIATION_NOT_FOUND"
              | "STORY_NOT_FOUND"
              | "STORY_DELIVERY_ALREADY_RECONCILED"
              | "STORY_DELIVERY_RECONCILIATION_INVALID"
              | "STORY_DELIVERY_RECONCILIATION_NOT_RECORDED";
            readonly message: string;
          }
        | CredentialUnavailableError
        | {
            readonly code: "DESTINATION_NOT_CONFIGURED";
            readonly message: string;
          };
    };

export function createReconcileStoryDelivery(dependencies: {
  readonly inspections: StoryInspectionRepository;
  readonly deliveries: StoryDeliveryRepository;
  readonly reconciliations: StoryDeliveryReconciliationRepository;
  readonly destinations: DeliveryDestinationDirectory;
  readonly createReconciliationId: () => StoryDeliveryReconciliationId;
  readonly now: () => string;
}) {
  return async (command: {
    readonly storyId: StoryId;
    readonly deliveryId: StoryDeliveryId;
    readonly decision: StoryDeliveryReconciliationDecision;
    readonly remoteId: string | null;
    readonly decidedBy: OperatorActor;
  }): Promise<ReconcileStoryDeliveryResult> => {
    const inspected = await dependencies.inspections.inspect(command.storyId);
    if (!inspected.ok)
      return {
        ok: false,
        error: { code: "STORY_NOT_FOUND", message: "The Story does not exist." },
      };
    const resolved = await dependencies.destinations.resolve();
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const destinationInstanceId: DestinationInstanceId = resolved.destination.instanceId;
    const delivery = await dependencies.deliveries.findUnresolvedById({
      storyId: command.storyId,
      deliveryId: command.deliveryId,
    });
    const latest = await dependencies.deliveries.findLatestUnresolved({
      storyId: command.storyId,
      destinationInstanceId,
    });
    if (
      !delivery ||
      delivery.id !== latest?.id ||
      delivery.destination !== resolved.destination.name ||
      delivery.destinationInstanceId !== destinationInstanceId
    )
      return {
        ok: false,
        error: {
          code: "STORY_DELIVERY_RECONCILIATION_NOT_FOUND",
          message: "The unresolved delivery does not exist for this destination installation.",
        },
      };
    const existing = await dependencies.reconciliations.findLatest({
      storyId: command.storyId,
      deliveryId: command.deliveryId,
      destinationInstanceId,
    });
    if (existing)
      return {
        ok: false,
        error: {
          code: "STORY_DELIVERY_ALREADY_RECONCILED",
          message: "This delivery uncertainty already has an operator decision.",
        },
      };
    if (
      command.decision === "delivered" &&
      delivery.request.operation === "update" &&
      command.remoteId !== delivery.remoteId
    )
      return {
        ok: false,
        error: {
          code: "STORY_DELIVERY_RECONCILIATION_INVALID",
          message: "An update reconciliation must retain the remote page recorded before delivery.",
        },
      };
    const recorded = recordStoryDeliveryReconciliation({
      id: dependencies.createReconciliationId(),
      storyId: delivery.storyId,
      deliveryId: delivery.id,
      destination: delivery.destination,
      destinationInstanceId,
      operation: delivery.request.operation,
      slug: delivery.request.slug,
      decision: command.decision,
      remoteId: command.remoteId,
      decidedBy: command.decidedBy,
      decidedAt: dependencies.now(),
    } as StoryDeliveryReconciliation);
    if (!recorded.ok)
      return {
        ok: false,
        error: { code: "STORY_DELIVERY_RECONCILIATION_INVALID", message: recorded.error.message },
      };
    const appended = await dependencies.reconciliations.append(recorded.reconciliation);
    if (!appended.ok)
      return {
        ok: false,
        error: {
          code: "STORY_DELIVERY_RECONCILIATION_NOT_RECORDED",
          message: appended.error.message,
        },
      };
    return { ok: true, reconciliation: appended.reconciliation };
  };
}
