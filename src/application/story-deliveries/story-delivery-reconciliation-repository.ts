import type {
  DestinationInstanceId,
  StoryDeliveryId,
  StoryDeliveryReconciliation,
  StoryId,
} from "@/domain/editorial";

export type AppendStoryDeliveryReconciliationResult =
  | { readonly ok: true; readonly reconciliation: StoryDeliveryReconciliation }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "STORY_DELIVERY_RECONCILIATION_CONFLICT";
        readonly message: string;
      };
    };

export interface StoryDeliveryReconciliationRepository {
  append(
    reconciliation: StoryDeliveryReconciliation,
  ): Promise<AppendStoryDeliveryReconciliationResult>;
  findLatest(query: {
    readonly storyId: StoryId;
    readonly deliveryId: StoryDeliveryId;
    readonly destinationInstanceId: DestinationInstanceId;
  }): Promise<StoryDeliveryReconciliation | null>;
}
