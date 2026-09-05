import {
  recordLegacyDeliveryMappingResolution,
  type CredentialUnavailableError,
  type LegacyDeliveryMappingDecision,
  type LegacyDeliveryMappingResolution,
  type LegacyDeliveryMappingResolutionId,
  type OperatorActor,
  type StoryDeliveryId,
  type StoryId,
} from "@/domain/editorial";
import type { StoryInspectionRepository } from "@/application/story-inspection";

import type { DeliveryDestinationDirectory } from "./delivery-destination";
import type { LegacyDeliveryMappingResolutionRepository } from "./legacy-delivery-mapping-resolution-repository";
import type { StoryDeliveryRepository } from "./story-delivery-repository";

export type ResolveLegacyDeliveryMappingResult =
  | { readonly ok: true; readonly resolution: LegacyDeliveryMappingResolution }
  | {
      readonly ok: false;
      readonly error:
        | CredentialUnavailableError
        | {
            readonly code:
              | "DESTINATION_NOT_CONFIGURED"
              | "STORY_NOT_FOUND"
              | "LEGACY_DELIVERY_MAPPING_NOT_FOUND"
              | "LEGACY_DELIVERY_MAPPING_STALE"
              | "LEGACY_DELIVERY_MAPPING_DESTINATION_MISMATCH"
              | "LEGACY_DELIVERY_MAPPING_RESOLUTION_INVALID"
              | "LEGACY_DELIVERY_MAPPING_RESOLUTION_ID_CONFLICT"
              | "LEGACY_DELIVERY_MAPPING_RESOLUTION_NOT_RECORDED";
            readonly message: string;
          };
    };

export function createResolveLegacyDeliveryMapping(dependencies: {
  readonly inspections: StoryInspectionRepository;
  readonly deliveries: StoryDeliveryRepository;
  readonly resolutions: LegacyDeliveryMappingResolutionRepository;
  readonly destinations: DeliveryDestinationDirectory;
  readonly createResolutionId: () => LegacyDeliveryMappingResolutionId;
  readonly now: () => string;
}) {
  return async (command: {
    readonly storyId: StoryId;
    readonly legacyDeliveryId: StoryDeliveryId;
    readonly decision: LegacyDeliveryMappingDecision;
    readonly decidedBy: OperatorActor;
  }): Promise<ResolveLegacyDeliveryMappingResult> => {
    const inspected = await dependencies.inspections.inspect(command.storyId);
    if (!inspected.ok)
      return {
        ok: false,
        error: { code: "STORY_NOT_FOUND", message: "The Story does not exist." },
      };
    const configured = await dependencies.destinations.resolve();
    if (!configured.ok) return { ok: false, error: configured.error };
    const legacy = await dependencies.deliveries.findSucceededById({
      storyId: command.storyId,
      deliveryId: command.legacyDeliveryId,
    });
    if (!legacy || legacy.destinationInstanceId !== null || legacy.remoteId === null)
      return {
        ok: false,
        error: {
          code: "LEGACY_DELIVERY_MAPPING_NOT_FOUND",
          message: "The requested successful legacy delivery mapping does not exist.",
        },
      };
    if (legacy.destination !== configured.destination.name)
      return {
        ok: false,
        error: {
          code: "LEGACY_DELIVERY_MAPPING_DESTINATION_MISMATCH",
          message: "The legacy mapping belongs to a different destination.",
        },
      };
    const latest = await dependencies.deliveries.findLatestLegacySucceeded({
      storyId: command.storyId,
      destination: configured.destination.name,
    });
    if (!latest || latest.id !== legacy.id)
      return {
        ok: false,
        error: {
          code: "LEGACY_DELIVERY_MAPPING_STALE",
          message: "The legacy delivery mapping is no longer the latest mapping to review.",
        },
      };
    const recorded = recordLegacyDeliveryMappingResolution({
      id: dependencies.createResolutionId(),
      storyId: command.storyId,
      legacyDeliveryId: legacy.id,
      destination: legacy.destination,
      destinationInstanceId: configured.destination.instanceId,
      remoteId: legacy.remoteId,
      decision: command.decision,
      decidedBy: command.decidedBy,
      decidedAt: dependencies.now(),
    });
    if (!recorded.ok)
      return {
        ok: false,
        error: {
          code: "LEGACY_DELIVERY_MAPPING_RESOLUTION_INVALID",
          message: recorded.error.message,
        },
      };
    const appended = await dependencies.resolutions.append(recorded.resolution);
    return appended.ok
      ? { ok: true, resolution: appended.resolution }
      : {
          ok: false,
          error: {
            code:
              appended.error.code === "LEGACY_DELIVERY_MAPPING_RESOLUTION_ID_CONFLICT"
                ? "LEGACY_DELIVERY_MAPPING_RESOLUTION_ID_CONFLICT"
                : "LEGACY_DELIVERY_MAPPING_RESOLUTION_NOT_RECORDED",
            message: appended.error.message,
          },
        };
  };
}
