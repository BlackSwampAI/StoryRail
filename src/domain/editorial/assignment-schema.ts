import { z } from "zod";

import { actorSchema, nonEmptyText } from "./schema-primitives";

export const assignmentSchema = z
  .object({
    id: nonEmptyText,
    storyId: nonEmptyText,
    writerProfileId: nonEmptyText,
    sourceIds: z.array(nonEmptyText),
    angle: nonEmptyText,
    brief: nonEmptyText,
    constraints: nonEmptyText.nullable(),
    assignedBy: actorSchema,
    assignedAt: nonEmptyText,
  })
  .strict()
  // One Source named twice would make the evidence look wider than it is.
  .refine(({ sourceIds }) => new Set(sourceIds).size === sourceIds.length)
  // An Assignment is made by an operator or by the Assignment Editor acting for one; no other
  // role may hand a Writer its work.
  .refine(
    ({ assignedBy }) => assignedBy.type === "operator" || assignedBy.role === "assignment_editor",
  );
