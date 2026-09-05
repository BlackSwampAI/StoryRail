import type {
  DestinationInstanceId,
  LegacyDeliveryMappingResolutionId,
  OperatorActor,
  StoryDeliveryId,
  StoryId,
} from "./types";

export const LEGACY_DELIVERY_MAPPING_DECISIONS = ["confirm", "dismiss"] as const;
export type LegacyDeliveryMappingDecision = (typeof LEGACY_DELIVERY_MAPPING_DECISIONS)[number];

/** The immutable operator decision that binds, or explicitly rejects, one legacy snapshot. */
export interface LegacyDeliveryMappingResolution {
  readonly id: LegacyDeliveryMappingResolutionId;
  readonly storyId: StoryId;
  readonly legacyDeliveryId: StoryDeliveryId;
  readonly destination: string;
  readonly destinationInstanceId: DestinationInstanceId;
  readonly remoteId: string;
  readonly decision: LegacyDeliveryMappingDecision;
  readonly decidedBy: OperatorActor;
  readonly decidedAt: string;
}

export type RecordLegacyDeliveryMappingResolutionResult =
  | { readonly ok: true; readonly resolution: LegacyDeliveryMappingResolution }
  | {
      readonly ok: false;
      readonly error: {
        readonly code:
          | "LEGACY_DELIVERY_MAPPING_RESOLUTION_IDENTITY_INVALID"
          | "LEGACY_DELIVERY_MAPPING_RESOLUTION_DECISION_INVALID"
          | "LEGACY_DELIVERY_MAPPING_RESOLUTION_OPERATOR_REQUIRED";
        readonly message: string;
      };
    };
