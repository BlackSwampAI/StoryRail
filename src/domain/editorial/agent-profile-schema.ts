import { z } from "zod";

import { AGENT_PROFILE_ROLES } from "./agent-profile-types";
import { modelDescriptorSchema, nonEmptyText } from "./schema-primitives";

export const agentProfileSchema = z
  .object({
    id: nonEmptyText,
    role: z.enum(AGENT_PROFILE_ROLES),
    name: nonEmptyText,
    instructions: nonEmptyText,
    // A Profile with no model of its own runs on whatever the Site configured for its role.
    model: modelDescriptorSchema.nullable(),
    builtIn: z.boolean(),
  })
  .strict();
