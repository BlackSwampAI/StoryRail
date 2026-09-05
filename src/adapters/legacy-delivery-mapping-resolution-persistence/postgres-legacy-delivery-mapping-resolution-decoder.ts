import {
  recordLegacyDeliveryMappingResolution,
  legacyDeliveryMappingResolutionSchema,
  type LegacyDeliveryMappingResolution,
} from "@/domain/editorial";

export class PostgresLegacyDeliveryMappingResolutionInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid persisted legacy delivery mapping resolution.");
    this.name = "PostgresLegacyDeliveryMappingResolutionInvariantError";
  }
}

export function decodePostgresLegacyDeliveryMappingResolution(
  payload: unknown,
): LegacyDeliveryMappingResolution {
  const parsed = legacyDeliveryMappingResolutionSchema.safeParse(payload);
  if (!parsed.success) throw new PostgresLegacyDeliveryMappingResolutionInvariantError();
  const recorded = recordLegacyDeliveryMappingResolution(
    parsed.data as unknown as LegacyDeliveryMappingResolution,
  );
  if (!recorded.ok) throw new PostgresLegacyDeliveryMappingResolutionInvariantError();
  return recorded.resolution;
}
