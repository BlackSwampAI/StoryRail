import { z } from "zod";

import { actorSchema, nonEmptyText, operatorActorSchema } from "./schema-primitives";
import { STORY_STATES } from "./types";

export const storySchema = z
  .object({
    id: nonEmptyText,
    title: nonEmptyText,
    state: z.enum(STORY_STATES),
    revisionCycle: z.number().int().min(0).max(2),
    createdAt: nonEmptyText,
    updatedAt: nonEmptyText,
    purpose: z
      .object({
        readerValue: nonEmptyText.refine((value) => value.length <= 2_000),
        focus: z.string().refine((value) => value.length <= 2_000),
      })
      .strict()
      .optional(),
    purposeUpdatedAt: nonEmptyText.optional(),
    purposeUpdatedBy: operatorActorSchema.optional(),
  })
  .strict()
  .superRefine((story, context) => {
    if ((story.purposeUpdatedAt === undefined) !== (story.purposeUpdatedBy === undefined))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Purpose update provenance must be complete.",
      });
    if (story.purposeUpdatedAt !== undefined && story.purpose === undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Purpose provenance requires a saved purpose.",
      });
  });

export const storyTransitionReceiptSchema = z
  .object({
    transitionId: nonEmptyText,
    storyId: nonEmptyText,
    previousState: z.enum(STORY_STATES),
    nextState: z.enum(STORY_STATES),
    actor: actorSchema,
    reason: nonEmptyText,
    occurredAt: nonEmptyText,
    revisionCycle: z.number().int().min(0),
  })
  .strict();

export const urlSourceSchema = z
  .object({
    id: nonEmptyText,
    type: z.literal("url"),
    submittedUrl: nonEmptyText,
    canonicalUrl: nonEmptyText,
    submittedBy: actorSchema,
    receivedAt: nonEmptyText,
  })
  .strict();

export const storySourceAttachmentSchema = z
  .object({
    storyId: nonEmptyText,
    sourceId: nonEmptyText,
    relevance: nonEmptyText,
    attachedBy: actorSchema,
    attachedAt: nonEmptyText,
  })
  .strict();
