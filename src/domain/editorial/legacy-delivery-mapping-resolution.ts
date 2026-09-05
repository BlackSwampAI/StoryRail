import type {
  LegacyDeliveryMappingResolution,
  RecordLegacyDeliveryMappingResolutionResult,
} from "./legacy-delivery-mapping-resolution-types";

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value === value.trim();

export function recordLegacyDeliveryMappingResolution(
  candidate: LegacyDeliveryMappingResolution,
): RecordLegacyDeliveryMappingResolutionResult {
  if (
    !nonEmpty(candidate.id) ||
    !nonEmpty(candidate.storyId) ||
    !nonEmpty(candidate.legacyDeliveryId) ||
    !nonEmpty(candidate.destination) ||
    !nonEmpty(candidate.destinationInstanceId) ||
    !nonEmpty(candidate.remoteId) ||
    !nonEmpty(candidate.decidedAt)
  )
    return {
      ok: false,
      error: {
        code: "LEGACY_DELIVERY_MAPPING_RESOLUTION_IDENTITY_INVALID",
        message: "Resolution identities, destination snapshot, and time are required.",
      },
    };
  if (candidate.decision !== "confirm" && candidate.decision !== "dismiss")
    return {
      ok: false,
      error: {
        code: "LEGACY_DELIVERY_MAPPING_RESOLUTION_DECISION_INVALID",
        message: "The legacy delivery mapping decision is unsupported.",
      },
    };
  if (candidate.decidedBy.type !== "operator" || !nonEmpty(candidate.decidedBy.operatorId))
    return {
      ok: false,
      error: {
        code: "LEGACY_DELIVERY_MAPPING_RESOLUTION_OPERATOR_REQUIRED",
        message: "A legacy delivery mapping resolution must be owned by an operator.",
      },
    };
  return { ok: true, resolution: structuredClone(candidate) };
}
