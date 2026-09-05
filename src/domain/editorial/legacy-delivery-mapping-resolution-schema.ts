import { z } from "zod";

import { nonEmptyText, operatorActorSchema } from "./schema-primitives";
import { LEGACY_DELIVERY_MAPPING_DECISIONS } from "./legacy-delivery-mapping-resolution-types";

export const legacyDeliveryMappingResolutionSchema = z
  .object({
    id: nonEmptyText,
    storyId: nonEmptyText,
    legacyDeliveryId: nonEmptyText,
    destination: nonEmptyText,
    destinationInstanceId: nonEmptyText,
    remoteId: nonEmptyText,
    decision: z.enum(LEGACY_DELIVERY_MAPPING_DECISIONS),
    decidedBy: operatorActorSchema,
    decidedAt: nonEmptyText,
  })
  .strict();
