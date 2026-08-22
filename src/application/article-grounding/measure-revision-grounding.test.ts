import { describe, expect, it } from "vitest";

import {
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
  assignmentId,
  operatorId,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
  storyId,
  type AgentRun,
} from "@/domain/editorial";

import { evidenceBehindRevision, measureRevisionGrounding } from "./measure-revision-grounding";

const STORY = storyId("story-measure");
const RUN = agentRunId("run-measure");
const WRITER = agentProfileId("writer-measure");
const USED = sourceId("source-used");
const LATER = sourceId("source-added-later");
const PREPARED = sourceEvidencePreparationId("prepared-used");
const OPERATOR = { type: "operator" as const, operatorId: operatorId("operator-measure") };

const document = (content: string) => ({
  format: "markdown" as const,
  content,
  title: null,
  byline: null,
  publishedAt: null,
  language: null,
});

const inspectionSource = (
  id: typeof USED,
  preparationId: typeof PREPARED,
  content: string,
  outcome: "succeeded" | "failed" = "succeeded",
) => ({
  attachment: {
    storyId: STORY,
    sourceId: id,
    relevance: "Primary",
    attachedBy: OPERATOR,
    attachedAt: "attached",
  },
  source: {
    id,
    type: "url" as const,
    submittedUrl: "https://example.test",
    canonicalUrl: "https://example.test" as never,
    submittedBy: OPERATOR,
    receivedAt: "received",
  },
  extractions: [],
  preparations: [
    {
      id: preparationId,
      sourceId: id,
      extractionId: sourceExtractionId("raw"),
      model: { provider: "openrouter", model: "prep" },
      preparer: { key: "prep", version: "1" },
      input: { rawCharacters: 100, submittedCharacters: 100 },
      requestedBy: OPERATOR,
      startedAt: "start",
      completedAt: "end",
      ...(outcome === "succeeded"
        ? { outcome: "succeeded" as const, document: document(content) }
        : {
            outcome: "failed" as const,
            failure: { code: "MODEL_OUTPUT_INVALID" as const, retryable: false },
          }),
    },
  ],
});

const writerRun: AgentRun = {
  id: RUN,
  storyId: STORY,
  profileId: WRITER,
  role: "writer",
  operation: "article_draft",
  model: { provider: "openrouter", model: "writer" },
  prompt: { key: "storyrail_writer_draft", version: "1" },
  requestedBy: OPERATOR,
  startedAt: "start",
  completedAt: "end",
  input: {
    story: { id: STORY, title: "Story", state: "assigned", revisionCycle: 0 },
    assignment: {
      id: assignmentId("assignment-measure"),
      storyId: STORY,
      writerProfileId: WRITER,
      sourceIds: [USED],
      angle: "Angle",
      brief: "Brief",
      constraints: null,
    },
    evidence: [
      { sourceId: USED, relevance: "Primary", evidenceKind: "prepared", evidenceId: PREPARED },
    ],
    unavailableSourceIds: [],
  },
  outcome: "succeeded",
  articleId: articleId("article-measure"),
  revisionId: articleRevisionId("revision-measure"),
};

const revision = {
  agentRunId: RUN,
  blocks: [
    {
      kind: "claim" as const,
      markdown: "The release shipped.",
      citations: [{ sourceId: USED, evidenceId: PREPARED, quote: "The release shipped" }],
    },
  ],
};

describe("measuring a Revision against the evidence its Writer was given", () => {
  it("resolves only the evidence recorded on the Writer run", () => {
    // The Story gained a Source after the draft was written. Crediting the Revision with
    // evidence its Writer never saw would flatter it.
    const inspection = {
      agentRuns: [writerRun],
      sources: [
        inspectionSource(USED, PREPARED, "The release shipped on Tuesday."),
        inspectionSource(
          LATER,
          sourceEvidencePreparationId("prepared-later"),
          "Added after the fact.",
        ),
      ],
    };

    expect(evidenceBehindRevision(inspection, revision)).toEqual([
      { sourceId: USED, evidenceId: PREPARED, content: "The release shipped on Tuesday." },
    ]);
  });

  it("skips evidence whose record did not succeed", () => {
    const inspection = {
      agentRuns: [writerRun],
      sources: [inspectionSource(USED, PREPARED, "unused", "failed")],
    };

    expect(evidenceBehindRevision(inspection, revision)).toEqual([]);
  });

  it("returns no evidence when the Writer run is missing", () => {
    expect(
      evidenceBehindRevision(
        { agentRuns: [], sources: [inspectionSource(USED, PREPARED, "Present.")] },
        revision,
      ),
    ).toEqual([]);
  });

  it("measures the Revision against that evidence", () => {
    const inspection = {
      agentRuns: [writerRun],
      sources: [inspectionSource(USED, PREPARED, "The release shipped on Tuesday.")],
    };

    expect(measureRevisionGrounding(inspection, revision)).toMatchObject({
      claimBlocks: 1,
      contextBlocks: 0,
      citations: 1,
      groundedShare: 1,
    });
  });
});
