import { describe, expect, expectTypeOf, it } from "vitest";

import {
  agentRunId,
  operatorId,
  sourceId,
  storyId,
  AGENT_ROLES,
  type EditorialActor,
  type SourceId,
  type StoryId,
} from "./types";
import type {
  AttachSourceToStoryCommand,
  AttachSourceToStoryResult,
  StorySourceAttachment,
} from "./story-source-attachment-types";
import { attachSourceToStory } from "./story-source-attachment";

const STORY_ID = storyId("opaque story identity; $1 --");
const SOURCE_ID = sourceId("opaque source identity; $2 --");
const ATTACHED_AT = "not parsed: 2026/08/09 25:61:99 +99";

describe("attachSourceToStory", () => {
  it("constructs the complete attachment with operator provenance", () => {
    const attachedBy = { type: "operator", operatorId: operatorId("operator-attachment") } as const;

    const result = attachSourceToStory({
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance: "Primary evidence for the reported event",
      attachedBy,
      attachedAt: ATTACHED_AT,
    });

    expect(result).toEqual({
      ok: true,
      attachment: {
        storyId: STORY_ID,
        sourceId: SOURCE_ID,
        relevance: "Primary evidence for the reported event",
        attachedBy,
        attachedAt: ATTACHED_AT,
      },
    });
    expect(result.ok && result.attachment.attachedBy).not.toBe(attachedBy);
  });

  it.each([
    ["spaces", "  Relevant evidence  "],
    ["tabs", "\tRelevant evidence\t"],
    ["newlines", "\r\nRelevant evidence\n"],
    ["Unicode whitespace", "\u00a0\u2003Relevant evidence\u202f\u3000"],
  ])("trims leading and trailing %s using the JavaScript boundary", (_, relevance) => {
    const result = attachSourceToStory({
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance,
      attachedBy: { type: "operator", operatorId: operatorId("operator-trim") },
      attachedAt: ATTACHED_AT,
    });

    expect(result.ok && result.attachment.relevance).toBe("Relevant evidence");
  });

  it.each(["", " ", "\t\n\r", "\u00a0\u2003\u202f\u3000"])(
    "rejects empty or whitespace-only relevance %j",
    (relevance) => {
      expect(
        attachSourceToStory({
          storyId: STORY_ID,
          sourceId: SOURCE_ID,
          relevance,
          attachedBy: { type: "operator", operatorId: operatorId("operator-empty") },
          attachedAt: ATTACHED_AT,
        }),
      ).toEqual({
        ok: false,
        error: {
          code: "STORY_SOURCE_RELEVANCE_REQUIRED",
          message: "A non-empty relevance is required to attach a Source to a Story.",
        },
      });
    },
  );

  it("preserves interior characters, whitespace, and multiline content exactly", () => {
    const relevance = "First  claim\twith spacing\n\nSecond line\r\n  indented detail";
    const result = attachSourceToStory({
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance: ` \n${relevance}\t `,
      attachedBy: { type: "operator", operatorId: operatorId("operator-interior") },
      attachedAt: ATTACHED_AT,
    });

    expect(result.ok && result.attachment.relevance).toBe(relevance);
  });

  it("imposes no arbitrary maximum relevance length", () => {
    const relevance = "evidence \twithin\ncontext ".repeat(20_000);
    const result = attachSourceToStory({
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance,
      attachedBy: { type: "operator", operatorId: operatorId("operator-large") },
      attachedAt: ATTACHED_AT,
    });

    expect(result.ok && result.attachment.relevance).toBe(relevance.trim());
  });

  it("preserves opaque branded identities and the timestamp without parsing or normalization", () => {
    const result = attachSourceToStory({
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance: "Opaque relationship facts",
      attachedBy: { type: "operator", operatorId: operatorId("operator-opaque") },
      attachedAt: ATTACHED_AT,
    });

    if (!result.ok) {
      throw new Error("The valid attachment fixture must succeed.");
    }
    expect(result.attachment.storyId).toBe(STORY_ID);
    expect(result.attachment.sourceId).toBe(SOURCE_ID);
    expect(result.attachment.attachedAt).toBe(ATTACHED_AT);
  });

  it.each(AGENT_ROLES)("supports attributable %s agent provenance", (role) => {
    const attachedBy = { type: "agent", role, runId: agentRunId(`run-${role}`) } as const;
    const result = attachSourceToStory({
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance: `Evidence selected by ${role}`,
      attachedBy,
      attachedAt: ATTACHED_AT,
    });

    expect(result.ok && result.attachment.attachedBy).toEqual(attachedBy);
  });

  it("returns a fresh nested actor snapshot and never mutates caller-owned data", () => {
    const attachedBy = {
      type: "agent" as const,
      role: "writer" as const,
      runId: agentRunId("mutable-run"),
    };
    const command: AttachSourceToStoryCommand = {
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance: "  Preserve command and actor  ",
      attachedBy,
      attachedAt: ATTACHED_AT,
    };
    const before = structuredClone(command);
    const result = attachSourceToStory(command);

    expect(command).toEqual(before);
    if (!result.ok) {
      throw new Error("The valid attachment fixture must succeed.");
    }
    expect(result.attachment).not.toBe(command);
    expect(result.attachment.attachedBy).not.toBe(attachedBy);
    (attachedBy as { runId: string }).runId = "changed-after-construction";
    expect(result.attachment.attachedBy).toEqual({
      type: "agent",
      role: "writer",
      runId: agentRunId("mutable-run"),
    });
  });

  it("exposes readonly values and branded identity boundaries", () => {
    expectTypeOf<AttachSourceToStoryCommand["storyId"]>().toEqualTypeOf<StoryId>();
    expectTypeOf<AttachSourceToStoryCommand["sourceId"]>().toEqualTypeOf<SourceId>();
    expectTypeOf<AttachSourceToStoryCommand["attachedBy"]>().toEqualTypeOf<EditorialActor>();
    expectTypeOf<AttachSourceToStoryResult>().toMatchTypeOf<
      { readonly ok: true; readonly attachment: StorySourceAttachment } | { readonly ok: false }
    >();
  });
});

function assertReadonlyAttachment(
  command: AttachSourceToStoryCommand,
  result: AttachSourceToStoryResult,
): void {
  // @ts-expect-error Attachment construction commands are readonly.
  command.relevance = "changed";
  // @ts-expect-error Ordinary strings are not branded Story IDs.
  const invalidStoryId: StoryId = "ordinary-story";
  // @ts-expect-error Ordinary strings are not branded Source IDs.
  const invalidSourceId: SourceId = "ordinary-source";
  if (result.ok) {
    // @ts-expect-error Attachments expose readonly fields.
    result.attachment.attachedAt = "changed";
  }
  void invalidStoryId;
  void invalidSourceId;
}

void assertReadonlyAttachment;
