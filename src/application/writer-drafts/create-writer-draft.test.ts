import { describe, expect, it, vi } from "vitest";
import { createWriterDraft } from "./create-writer-draft";
import type { WriterDraftPersistence } from "./writer-draft-persistence";
import type { StructuredModel, StructuredModelRequest } from "@/application/model";
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
  transitionId,
  type AgentRun,
} from "@/domain/editorial";

function fixture() {
  const story = {
    id: storyId("story-31"),
    title: "Assigned Story",
    state: "assigned" as const,
    revisionCycle: 0,
    createdAt: "created",
    updatedAt: "assigned",
  };
  const writer = {
    id: agentProfileId("writer-31"),
    role: "writer" as const,
    name: "Writer",
    instructions: "Write clearly.",
    model: null,
    builtIn: true,
  };
  const assignment = {
    id: assignmentId("assignment-31"),
    storyId: story.id,
    writerProfileId: writer.id,
    sourceIds: [sourceId("source-a"), sourceId("source-b")],
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    assignedBy: { type: "operator" as const, operatorId: operatorId("operator-31") },
    assignedAt: "assigned",
  };
  const document = {
    format: "markdown" as const,
    content: "Evidence",
    title: null,
    byline: null,
    publishedAt: null,
    language: null,
  };
  return {
    story,
    writer,
    assignment,
    inspection: {
      story,
      assignment: { assignment, writerProfile: writer },
      article: null,
      transitions: [],
      agentRuns: [],
      reviewDecisions: [],
      sources: [
        {
          attachment: {
            storyId: story.id,
            sourceId: sourceId("source-a"),
            relevance: "Primary",
            attachedBy: assignment.assignedBy,
            attachedAt: "attached",
          },
          source: {
            id: sourceId("source-a"),
            type: "url" as const,
            submittedUrl: "https://a.test",
            canonicalUrl: "https://a.test" as never,
            submittedBy: assignment.assignedBy,
            receivedAt: "received",
          },
          extractions: [
            {
              id: sourceExtractionId("raw-a"),
              sourceId: sourceId("source-a"),
              extractor: { key: "test", version: "1" },
              requestedBy: assignment.assignedBy,
              startedAt: "start",
              completedAt: "end",
              outcome: "succeeded" as const,
              document,
            },
          ],
          preparations: [
            {
              id: sourceEvidencePreparationId("prepared-a"),
              sourceId: sourceId("source-a"),
              extractionId: sourceExtractionId("raw-a"),
              model: { provider: "openrouter", model: "prep" },
              preparer: { key: "prep", version: "1" },
              requestedBy: assignment.assignedBy,
              startedAt: "start",
              completedAt: "end",
              outcome: "succeeded" as const,
              document,
            },
          ],
        },
        {
          attachment: {
            storyId: story.id,
            sourceId: sourceId("source-b"),
            relevance: "Context",
            attachedBy: assignment.assignedBy,
            attachedAt: "attached",
          },
          source: {
            id: sourceId("source-b"),
            type: "url" as const,
            submittedUrl: "https://b.test",
            canonicalUrl: "https://b.test" as never,
            submittedBy: assignment.assignedBy,
            receivedAt: "received",
          },
          extractions: [],
          preparations: [],
        },
      ],
    },
  };
}

describe("createWriterDraft", () => {
  it("uses prepared Assignment evidence, records unavailable Sources, and persists Revision 1", async () => {
    const facts = fixture();
    const generateStructured = vi.fn(async (request: StructuredModelRequest<unknown>) => {
      void request;
      return {
        ok: true as const,
        output: { headline: "Draft", dek: null, bodyMarkdown: "Body" },
      };
    });
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "default-writer" },
      generateStructured: generateStructured as StructuredModel["generateStructured"],
    };
    const persist = vi.fn<WriterDraftPersistence["persist"]>(async (command) => ({
      ok: true as const,
      run: command.run,
      article: command.article,
      revision: command.revision,
      story: command.story,
      transitionReceipt: command.transitionReceipt,
    }));
    const workflow = createWriterDraft({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      runs: { append: vi.fn(), listByStoryId: vi.fn() },
      persistence: { persist },
      resolveModel: () => ({
        ok: true,
        model,
      }),
      createAgentRunId: () => agentRunId("run-31"),
      createArticleId: () => articleId("article-31"),
      createRevisionId: () => articleRevisionId("revision-31"),
      createTransitionId: () => transitionId("transition-31"),
      now: vi
        .fn()
        .mockReturnValueOnce("started")
        .mockReturnValueOnce("completed")
        .mockReturnValue("persisted"),
    });
    const result = await workflow({
      storyId: facts.story.id,
      requestedBy: facts.assignment.assignedBy,
    });
    expect(generateStructured).toHaveBeenCalledOnce();
    expect(generateStructured.mock.calls[0]?.[0].input).toMatchObject({
      unavailableSourceIds: [sourceId("source-b")],
      evidence: [
        expect.objectContaining({
          evidenceKind: "prepared",
          evidenceId: sourceEvidencePreparationId("prepared-a"),
        }),
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      story: { state: "in_progress" },
      revision: { revisionNumber: 1 },
      transitionReceipt: { actor: { type: "agent", role: "writer", runId: agentRunId("run-31") } },
    });
  });

  it("persists a failed run without invoking draft persistence", async () => {
    const facts = fixture();
    const append = vi.fn(async (run: AgentRun) => ({ ok: true as const, run }));
    const persist = vi.fn();
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "writer" },
      generateStructured: vi.fn(async () => ({
        ok: false as const,
        failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
      })) as StructuredModel["generateStructured"],
    };
    const workflow = createWriterDraft({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      runs: { append, listByStoryId: vi.fn() },
      persistence: { persist },
      resolveModel: () => ({
        ok: true,
        model,
      }),
      createAgentRunId: () => agentRunId("run-failed"),
      createArticleId: () => articleId("unused"),
      createRevisionId: () => articleRevisionId("unused"),
      createTransitionId: () => transitionId("unused"),
      now: () => "now",
    });
    expect(
      await workflow({ storyId: facts.story.id, requestedBy: facts.assignment.assignedBy }),
    ).toMatchObject({ ok: true, run: { outcome: "failed" } });
    expect(append).toHaveBeenCalledOnce();
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not call a model when no Assignment evidence is usable", async () => {
    const facts = fixture();
    const resolveModel = vi.fn();
    const inspection = {
      ...facts.inspection,
      sources: facts.inspection.sources.map((source) => ({
        ...source,
        extractions: [],
        preparations: [],
      })),
    };
    const workflow = createWriterDraft({
      inspections: { inspect: vi.fn(async () => ({ ok: true as const, inspection })) },
      runs: {} as never,
      persistence: {} as never,
      resolveModel,
      createAgentRunId: () => agentRunId("unused"),
      createArticleId: () => articleId("unused"),
      createRevisionId: () => articleRevisionId("unused"),
      createTransitionId: () => transitionId("unused"),
      now: () => "now",
    });
    expect(
      await workflow({ storyId: facts.story.id, requestedBy: facts.assignment.assignedBy }),
    ).toMatchObject({ ok: false, error: { code: "WRITER_EVIDENCE_REQUIRED" } });
    expect(resolveModel).not.toHaveBeenCalled();
  });
});
