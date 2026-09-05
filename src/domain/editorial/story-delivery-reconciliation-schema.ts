import { z } from "zod";

import { nonEmptyText, operatorActorSchema } from "./schema-primitives";
import { DELIVERY_OPERATIONS } from "./story-delivery-types";

const common = {
  id: nonEmptyText,
  storyId: nonEmptyText,
  deliveryId: nonEmptyText,
  destination: nonEmptyText,
  destinationInstanceId: nonEmptyText,
  operation: z.enum(DELIVERY_OPERATIONS),
  slug: nonEmptyText,
  decidedBy: operatorActorSchema,
  decidedAt: nonEmptyText,
};

export const storyDeliveryReconciliationSchema = z.discriminatedUnion("decision", [
  z.object({ ...common, decision: z.literal("delivered"), remoteId: nonEmptyText }).strict(),
  z.object({ ...common, decision: z.literal("not_delivered"), remoteId: z.null() }).strict(),
]);
