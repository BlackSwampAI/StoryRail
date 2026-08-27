import { z } from "zod";

import { actorSchema, nonEmptyText } from "./schema-primitives";
import { STORY_STATES } from "./types";

export const storySchema = z
  .object({
    id: nonEmptyText,
    title: nonEmptyText,
    state: z.enum(STORY_STATES),
    revisionCycle: z.number().int().min(0).max(2),
    createdAt: nonEmptyText,
    updatedAt: nonEmptyText,
  })
  .strict();

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
