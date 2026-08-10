import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  agentRunId,
  operatorId,
  sourceExtractionId,
  sourceId,
  storyId,
  type FailedSourceExtraction,
  type SourceId,
  type SourceExtraction,
  type SuccessfulSourceExtraction,
  type Story,
  type StoryId,
  type StorySourceAttachment,
  type UrlSource,
} from "@/domain/editorial";

import type {
  InspectStoryResult,
  StoryInspectionRepository,
  StoryInspectionSource,
} from "./story-inspection-repository";

export interface StoryInspectionRepositoryContractHarness {
  readonly createRepository: () => StoryInspectionRepository | Promise<StoryInspectionRepository>;
  readonly addStory: (story: Story) => void | Promise<void>;
  readonly addSource: (source: UrlSource) => void | Promise<void>;
  readonly addAttachment: (attachment: StorySourceAttachment) => void | Promise<void>;
  readonly addExtraction: (extraction: SourceExtraction) => void | Promise<void>;
}

function makeStory(suffix: string): Story {
  return {
    id: storyId(`story-inspection-contract-${suffix}`),
    title: `Inspectable Story ${suffix}`,
    state: "intake",
    revisionCycle: 0,
    createdAt: `opaque-created-${suffix}`,
    updatedAt: `opaque-updated-${suffix}`,
  };
}

function makeSource(
  suffix: string,
  id = sourceId(`source-inspection-contract-${suffix}`),
): UrlSource {
  return {
    id,
    type: "url",
    submittedUrl: `https://example.com/submitted/${suffix}?utm_source=contract`,
    canonicalUrl: `https://example.com/submitted/${suffix}` as UrlSource["canonicalUrl"],
    submittedBy: { type: "operator", operatorId: operatorId(`source-operator-${suffix}`) },
    receivedAt: `opaque-received-${suffix}`,
  };
}

function makeAttachment(
  story: Story,
  source: UrlSource,
  attachedBy: StorySourceAttachment["attachedBy"] = {
    type: "operator",
    operatorId: operatorId(`attachment-operator-${source.id}`),
  },
): StorySourceAttachment {
  return {
    storyId: story.id,
    sourceId: source.id,
    relevance: `Exact relevance for ${source.id}`,
    attachedBy,
    attachedAt: `opaque-attached-${source.id}`,
  };
}

function makeSuccessfulExtraction(
  source: UrlSource,
  suffix: string,
  requestedBy: SourceExtraction["requestedBy"] = {
    type: "operator",
    operatorId: operatorId(`extraction-operator-${suffix}`),
  },
): SuccessfulSourceExtraction {
  return {
    id: sourceExtractionId(`extraction-inspection-contract-${suffix}`),
    sourceId: source.id,
    extractor: { key: `extractor-${suffix}`, version: `version-${suffix}` },
    requestedBy,
    startedAt: `opaque-started-${suffix}`,
    completedAt: `opaque-completed-${suffix}`,
    outcome: "succeeded",
    document: {
      format: "markdown",
      content: `# Exact Markdown ${suffix}\n\n  Preserve spacing.  `,
      title: `Document ${suffix}`,
      byline: null,
      publishedAt: null,
      language: "en",
    },
  };
}

function makeFailedExtraction(source: UrlSource, suffix: string): FailedSourceExtraction {
  return {
    id: sourceExtractionId(`extraction-inspection-contract-${suffix}`),
    sourceId: source.id,
    extractor: { key: `extractor-${suffix}`, version: `version-${suffix}` },
    requestedBy: {
      type: "agent",
      role: "fact_checker",
      runId: agentRunId(`extraction-agent-${suffix}`),
    },
    startedAt: `opaque-started-${suffix}`,
    completedAt: `opaque-completed-${suffix}`,
    outcome: "failed",
    failure: { code: "RETRIEVAL_FAILED", retryable: true },
  };
}

export function describeStoryInspectionRepositoryContract(
  createHarness: () =>
    StoryInspectionRepositoryContractHarness | Promise<StoryInspectionRepositoryContractHarness>,
): void {
  let repository: StoryInspectionRepository;
  let addStory: StoryInspectionRepositoryContractHarness["addStory"];
  let addSource: StoryInspectionRepositoryContractHarness["addSource"];
  let addAttachment: StoryInspectionRepositoryContractHarness["addAttachment"];
  let addExtraction: StoryInspectionRepositoryContractHarness["addExtraction"];

  beforeEach(async () => {
    const harness = await createHarness();
    repository = await harness.createRepository();
    addStory = harness.addStory;
    addSource = harness.addSource;
    addAttachment = harness.addAttachment;
    addExtraction = harness.addExtraction;
  });

  async function addAttachedSource(
    story: Story,
    source: UrlSource,
    attachedBy?: StorySourceAttachment["attachedBy"],
  ): Promise<StorySourceAttachment> {
    const attachment = makeAttachment(story, source, attachedBy);
    await addSource(source);
    await addAttachment(attachment);
    return attachment;
  }

  describe("StoryInspectionRepository contract", () => {
    it("returns the complete Story and an empty Source collection for an unattached Story", async () => {
      const story = makeStory("unattached");
      await addStory(story);

      await expect(repository.inspect(story.id)).resolves.toEqual({
        ok: true,
        inspection: { story, sources: [] },
      });
    });

    it("returns one exact Source with its exact attachment", async () => {
      const story = makeStory("one-source");
      const source = makeSource("one-source");
      await addStory(story);
      const attachment = await addAttachedSource(story, source);

      await expect(repository.inspect(story.id)).resolves.toEqual({
        ok: true,
        inspection: { story, sources: [{ attachment, source, extractions: [] }] },
      });
    });

    it("returns every attached Source exactly once in deterministic Source-ID order", async () => {
      const story = makeStory("many-sources");
      const sources = [
        makeSource("z-last", sourceId("z-opaque-source")),
        makeSource("a-first", sourceId("a-opaque-source")),
        makeSource("m-middle", sourceId("m-opaque-source")),
      ];
      await addStory(story);
      const attachments = new Map<SourceId, StorySourceAttachment>();

      for (const source of sources) {
        attachments.set(source.id, await addAttachedSource(story, source));
      }

      const result = await repository.inspect(story.id);
      if (!result.ok) {
        throw new Error("The multiple-Source inspection setup must succeed.");
      }

      expect(result.inspection.sources).toEqual(
        [...sources]
          .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
          .map((source) => ({ attachment: attachments.get(source.id), source, extractions: [] })),
      );
      expect(new Set(result.inspection.sources.map(({ source }) => source.id)).size).toBe(3);
    });

    it("does not reinterpret opaque attachment timestamps as editorial ordering", async () => {
      const story = makeStory("technical-order");
      const firstByIdentity = makeSource("technical-a", sourceId("a-technical-source"));
      const lastByIdentity = makeSource("technical-z", sourceId("z-technical-source"));
      await addStory(story);
      const lastAttachment = {
        ...makeAttachment(story, lastByIdentity),
        attachedAt: "0000-apparently-earlier",
      };
      const firstAttachment = {
        ...makeAttachment(story, firstByIdentity),
        attachedAt: "9999-apparently-later",
      };
      await addSource(lastByIdentity);
      await addAttachment(lastAttachment);
      await addSource(firstByIdentity);
      await addAttachment(firstAttachment);

      const result = await repository.inspect(story.id);
      if (!result.ok) {
        throw new Error("The technical-order inspection setup must succeed.");
      }

      expect(result.inspection.sources).toEqual([
        { attachment: firstAttachment, source: firstByIdentity, extractions: [] },
        { attachment: lastAttachment, source: lastByIdentity, extractions: [] },
      ]);
    });

    it("round-trips operator and agent attachment provenance unchanged", async () => {
      const story = makeStory("provenance");
      const operatorSource = makeSource("operator-provenance");
      const agentSource = makeSource("agent-provenance");
      const operator = { type: "operator" as const, operatorId: operatorId("operator-exact") };
      const agent = {
        type: "agent" as const,
        role: "editor_in_chief" as const,
        runId: agentRunId("agent-run-exact"),
      };
      await addStory(story);
      const operatorAttachment = await addAttachedSource(story, operatorSource, operator);
      const agentAttachment = await addAttachedSource(story, agentSource, agent);

      const result = await repository.inspect(story.id);
      if (!result.ok) {
        throw new Error("The provenance inspection setup must succeed.");
      }

      expect(result.inspection.sources).toEqual([
        { attachment: agentAttachment, source: agentSource, extractions: [] },
        { attachment: operatorAttachment, source: operatorSource, extractions: [] },
      ]);
    });

    it("returns exact successful and failed extraction facts in durable append order", async () => {
      const story = makeStory("extraction-history");
      const source = makeSource("extraction-history");
      const successful = makeSuccessfulExtraction(source, "first-success");
      const failed = makeFailedExtraction(source, "second-failure");
      await addStory(story);
      const attachment = await addAttachedSource(story, source);
      await addExtraction(successful);
      await addExtraction(failed);

      await expect(repository.inspect(story.id)).resolves.toEqual({
        ok: true,
        inspection: {
          story,
          sources: [{ attachment, source, extractions: [successful, failed] }],
        },
      });
    });

    it("keeps nullable successful metadata, opaque timestamps, and provenance unchanged", async () => {
      const story = makeStory("extraction-opaque");
      const source = makeSource("extraction-opaque");
      const agent = {
        type: "agent" as const,
        role: "assignment_editor" as const,
        runId: agentRunId("opaque-extraction-run"),
      };
      const extraction = {
        ...makeSuccessfulExtraction(source, "opaque", agent),
        startedAt: "not-a-date-started",
        completedAt: "not-a-date-completed",
        document: {
          ...makeSuccessfulExtraction(source, "opaque", agent).document,
          title: null,
          byline: null,
          publishedAt: null,
          language: null,
        },
      } as SourceExtraction;
      await addStory(story);
      const attachment = await addAttachedSource(story, source);
      await addExtraction(extraction);

      await expect(repository.inspect(story.id)).resolves.toEqual({
        ok: true,
        inspection: { story, sources: [{ attachment, source, extractions: [extraction] }] },
      });
    });

    it("keeps each Source's history isolated and never duplicates joined Sources", async () => {
      const story = makeStory("extraction-many-sources");
      const sourceA = makeSource("history-a", sourceId("a-history-source"));
      const sourceZ = makeSource("history-z", sourceId("z-history-source"));
      const attachmentA = makeAttachment(story, sourceA);
      const attachmentZ = makeAttachment(story, sourceZ);
      const extractionA1 = makeSuccessfulExtraction(sourceA, "a-one");
      const extractionA2 = makeFailedExtraction(sourceA, "a-two");
      const extractionZ = makeSuccessfulExtraction(sourceZ, "z-one");
      await addStory(story);
      await addSource(sourceZ);
      await addAttachment(attachmentZ);
      await addSource(sourceA);
      await addAttachment(attachmentA);
      await addExtraction(extractionA1);
      await addExtraction(extractionZ);
      await addExtraction(extractionA2);

      const result = await repository.inspect(story.id);
      if (!result.ok) throw new Error("The multi-Source extraction setup must succeed.");

      expect(result.inspection.sources).toEqual([
        { attachment: attachmentA, source: sourceA, extractions: [extractionA1, extractionA2] },
        { attachment: attachmentZ, source: sourceZ, extractions: [extractionZ] },
      ]);
      expect(result.inspection.sources).toHaveLength(2);
    });

    it("returns the exact stable failure for a missing Story", async () => {
      const missingStoryId = storyId("missing-inspection-story");

      await expect(repository.inspect(missingStoryId)).resolves.toEqual({
        ok: false,
        error: {
          code: "STORY_NOT_FOUND",
          message: "The Story to inspect does not exist.",
          storyId: missingStoryId,
        },
      });
    });

    it("returns fresh objects that do not share caller-owned or prior-result references", async () => {
      const story = makeStory("isolation");
      const source = makeSource("isolation");
      const extraction = makeSuccessfulExtraction(source, "isolation");
      await addStory(story);
      const attachment = await addAttachedSource(story, source);
      await addExtraction(extraction);
      const first = await repository.inspect(story.id);

      if (!first.ok) {
        throw new Error("The isolation inspection setup must succeed.");
      }

      (story as { title: string }).title = "Mutated caller Story";
      (source.submittedBy as { operatorId: string }).operatorId = "mutated-caller-source-actor";
      (attachment.attachedBy as { operatorId: string }).operatorId =
        "mutated-caller-attachment-actor";
      (extraction.document as { content: string }).content = "Mutated caller extraction Markdown";
      (first.inspection.story as { title: string }).title = "Mutated result Story";
      (first.inspection.sources[0]?.source.submittedBy as { operatorId: string }).operatorId =
        "mutated-result-source-actor";
      (first.inspection.sources[0]?.attachment.attachedBy as { operatorId: string }).operatorId =
        "mutated-result-attachment-actor";
      const firstExtraction = first.inspection.sources[0]?.extractions[0];
      if (firstExtraction?.outcome === "succeeded") {
        (firstExtraction.document as { content: string }).content =
          "Mutated result extraction Markdown";
      }

      const second = await repository.inspect(story.id);
      if (!second.ok) {
        throw new Error("The repeated isolation inspection must succeed.");
      }

      expect(second.inspection).toEqual({
        story: makeStory("isolation"),
        sources: [
          {
            attachment: makeAttachment(makeStory("isolation"), makeSource("isolation")),
            source: makeSource("isolation"),
            extractions: [makeSuccessfulExtraction(makeSource("isolation"), "isolation")],
          },
        ],
      });
      expect(second.inspection).not.toBe(first.inspection);
      expect(second.inspection.story).not.toBe(first.inspection.story);
      expect(second.inspection.sources).not.toBe(first.inspection.sources);
      expect(second.inspection.sources[0]?.source.submittedBy).not.toBe(
        first.inspection.sources[0]?.source.submittedBy,
      );
      expect(second.inspection.sources[0]?.attachment.attachedBy).not.toBe(
        first.inspection.sources[0]?.attachment.attachedBy,
      );
      expect(second.inspection.sources[0]?.extractions).not.toBe(
        first.inspection.sources[0]?.extractions,
      );
      expect(second.inspection.sources[0]?.extractions[0]).not.toBe(
        first.inspection.sources[0]?.extractions[0],
      );
    });

    it("exposes only inspect with readonly output and branded Story identity", () => {
      expect(Object.keys(repository)).toEqual(["inspect"]);
      expectTypeOf<Parameters<StoryInspectionRepository["inspect"]>[0]>().toEqualTypeOf<StoryId>();
      expectTypeOf<StoryInspectionSource["extractions"]>().toEqualTypeOf<
        readonly SourceExtraction[]
      >();
      expectTypeOf<InspectStoryResult>().toMatchTypeOf<
        | { readonly ok: true; readonly inspection: { readonly story: Story } }
        | { readonly ok: false; readonly error: { readonly storyId: StoryId } }
      >();
    });
  });
}

export function createReferenceStoryInspectionRepositoryHarness(): StoryInspectionRepositoryContractHarness {
  const stories = new Map<StoryId, Story>();
  const sources = new Map<SourceId, UrlSource>();
  const attachments = new Map<StoryId, Map<SourceId, StorySourceAttachment>>();
  const extractions = new Map<SourceId, SourceExtraction[]>();

  return {
    createRepository() {
      return {
        async inspect(storyIdentity): Promise<InspectStoryResult> {
          const story = stories.get(storyIdentity);

          if (!story) {
            return {
              ok: false,
              error: {
                code: "STORY_NOT_FOUND",
                message: "The Story to inspect does not exist.",
                storyId: storyIdentity,
              },
            };
          }

          const inspectionSources = [...(attachments.get(storyIdentity)?.values() ?? [])]
            .sort((left, right) =>
              left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0,
            )
            .map((attachment) => {
              const source = sources.get(attachment.sourceId);
              if (!source) {
                throw new Error("Reference Story inspection contains an impossible relationship.");
              }
              return { attachment, source, extractions: extractions.get(source.id) ?? [] };
            });

          return {
            ok: true,
            inspection: structuredClone({ story, sources: inspectionSources }),
          };
        },
      };
    },
    addStory(story) {
      stories.set(story.id, structuredClone(story));
    },
    addSource(source) {
      sources.set(source.id, structuredClone(source));
    },
    addAttachment(attachment) {
      const storyAttachments = attachments.get(attachment.storyId) ?? new Map();
      storyAttachments.set(attachment.sourceId, structuredClone(attachment));
      attachments.set(attachment.storyId, storyAttachments);
    },
    addExtraction(extraction) {
      const sourceExtractions = extractions.get(extraction.sourceId) ?? [];
      sourceExtractions.push(structuredClone(extraction));
      extractions.set(extraction.sourceId, sourceExtractions);
    },
  };
}
