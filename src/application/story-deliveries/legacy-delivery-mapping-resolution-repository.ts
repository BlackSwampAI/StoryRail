import type {
  DestinationInstanceId,
  LegacyDeliveryMappingResolution,
  StoryId,
} from "@/domain/editorial";

export type AppendLegacyDeliveryMappingResolutionResult =
  | { readonly ok: true; readonly resolution: LegacyDeliveryMappingResolution }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "LEGACY_DELIVERY_MAPPING_RESOLUTION_ID_CONFLICT";
        readonly message: string;
      };
    };

export interface LegacyDeliveryMappingResolutionRepository {
  /** Replaying the identical immutable fact succeeds; reusing its id for another fact conflicts. */
  append(
    resolution: LegacyDeliveryMappingResolution,
  ): Promise<AppendLegacyDeliveryMappingResolutionResult>;
  findLatest(query: {
    readonly storyId: StoryId;
    readonly legacyDeliveryId: import("@/domain/editorial").StoryDeliveryId;
    readonly destinationInstanceId: DestinationInstanceId;
  }): Promise<LegacyDeliveryMappingResolution | null>;
}
