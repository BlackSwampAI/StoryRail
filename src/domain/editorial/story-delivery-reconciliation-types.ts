import type {
  DestinationInstanceId,
  OperatorActor,
  StoryDeliveryId,
  StoryDeliveryReconciliationId,
  StoryId,
} from "./types";
import type { DeliveryOperation } from "./story-delivery-types";

export const STORY_DELIVERY_RECONCILIATION_DECISIONS = ["delivered", "not_delivered"] as const;
export type StoryDeliveryReconciliationDecision =
  (typeof STORY_DELIVERY_RECONCILIATION_DECISIONS)[number];

/** An immutable operator decision about one delivery whose external outcome was unknowable. */
export type StoryDeliveryReconciliation = {
  readonly id: StoryDeliveryReconciliationId;
  readonly storyId: StoryId;
  readonly deliveryId: StoryDeliveryId;
  readonly destination: string;
  readonly destinationInstanceId: DestinationInstanceId;
  readonly operation: DeliveryOperation;
  readonly slug: string;
  readonly decidedBy: OperatorActor;
  readonly decidedAt: string;
} & (
  | { readonly decision: "delivered"; readonly remoteId: string }
  | { readonly decision: "not_delivered"; readonly remoteId: null }
);

export type RecordStoryDeliveryReconciliationResult =
  | { readonly ok: true; readonly reconciliation: StoryDeliveryReconciliation }
  | {
      readonly ok: false;
      readonly error: {
        readonly code:
          | "STORY_DELIVERY_RECONCILIATION_IDENTITY_INVALID"
          | "STORY_DELIVERY_RECONCILIATION_DECISION_INVALID"
          | "STORY_DELIVERY_RECONCILIATION_OPERATOR_REQUIRED";
        readonly message: string;
      };
    };
