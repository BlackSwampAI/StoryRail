import { describe, expect, it, vi } from "vitest";
import type { StructuredModel } from "@/application/model";
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
import { createRunDirectorReview } from "./run-director-review";

function fixture() {
  const actor = { type: "operator" as const, operatorId: operatorId("operator-38") };
  const story = {
    id: storyId("story-38"),
    title: "Story",
    state: "in_review" as const,
    revisionCycle: 0,
    createdAt: "created",
    updatedAt: "review",
  };
  const writer = {
    id: agentProfileId("writer-38"),
    role: "writer" as const,
    name: "Writer",
    instructions: "Write.",
    model: null,
    builtIn: true,
  };
  const director = {
    id: agentProfileId("storyrail-director-v1"),
    role: "editor_in_chief" as const,
    name: "Director",
    instructions: "Review.",
    model: null,
    builtIn: true,
  };
  const assignment = {
    id: assignmentId("assignment-38"),
    storyId: story.id,
    writerProfileId: writer.id,
    sourceIds: [sourceId("source-38")],
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    assignedBy: actor,
    assignedAt: "assigned",
  };
  const article = {
    id: articleId("article-38"),
    storyId: story.id,
    assignmentId: assignment.id,
    createdAt: "drafted",
  };
  const revision = {
    id: articleRevisionId("revision-38"),
    articleId: article.id,
    revisionNumber: 1 as const,
    writerProfileId: writer.id,
    agentRunId: agentRunId("writer-run-38"),
    headline: "Headline",
    dek: null,
    bodyMarkdown: "Body",
    createdBy: {
      type: "agent" as const,
      role: "writer" as const,
      runId: agentRunId("writer-run-38"),
    },
    createdAt: "drafted",
  };
  const preparationA = sourceEvidencePreparationId("preparation-a");
  const writerRun: AgentRun = {
    id: revision.agentRunId,
    storyId: story.id,
    profileId: writer.id,
    role: "writer",
    operation: "article_draft",
    model: { provider: "openrouter", model: "writer-model" },
    prompt: { key: "storyrail_writer_draft", version: "1" },
    requestedBy: actor,
    startedAt: "writer-start",
    completedAt: "writer-end",
    input: {
      story: { id: story.id, title: story.title, state: "assigned", revisionCycle: 0 },
      assignment: {
        id: assignment.id,
        storyId: story.id,
        writerProfileId: writer.id,
        sourceIds: assignment.sourceIds,
        angle: assignment.angle,
        brief: assignment.brief,
        constraints: null,
      },
      evidence: [
        {
          sourceId: sourceId("source-38"),
          relevance: "Primary",
          evidenceKind: "prepared",
          evidenceId: preparationA,
        },
      ],
      unavailableSourceIds: [],
    },
    outcome: "succeeded",
    articleId: article.id,
    revisionId: revision.id,
  };
  const document = (content: string) => ({
    format: "markdown" as const,
    content,
    title: null,
    byline: null,
    publishedAt: null,
    language: null,
  });
  const preparation = (id: ReturnType<typeof sourceEvidencePreparationId>, content: string) => ({
    id,
    sourceId: sourceId("source-38"),
    extractionId: sourceExtractionId(`raw-${id}`),
    model: { provider: "openrouter", model: "prep" },
    preparer: { key: "prep", version: "1" },
    input: { rawCharacters: 512, submittedCharacters: 512 },
    requestedBy: actor,
    startedAt: "start",
    completedAt: "end",
    outcome: "succeeded" as const,
    document: document(content),
  });
  return {
    actor,
    director,
    preparationA,
    inspection: {
      story,
      assignment: { assignment, writerProfile: writer },
      article: { article, revisions: [revision] },
      transitions: [],
      agentRuns: [writerRun],
      reviewDecisions: [],
      sources: [
        {
          attachment: {
            storyId: story.id,
            sourceId: sourceId("source-38"),
            relevance: "Primary",
            attachedBy: actor,
            attachedAt: "attached",
          },
          source: {
            id: sourceId("source-38"),
            type: "url" as const,
            submittedUrl: "https://example.test",
            canonicalUrl: "https://example.test" as never,
            submittedBy: actor,
            receivedAt: "received",
          },
          extractions: [],
          preparations: [
            preparation(preparationA, "Evidence A"),
            preparation(sourceEvidencePreparationId("preparation-b"), "Evidence B"),
          ],
        },
      ],
    },
  };
}

describe("run Director review", () => {
  it("resolves the Writer run's exact historical evidence and stores references without bodies", async () => {
    const facts = fixture();
    const generateStructured = vi.fn(async () => ({
      ok: true as const,
      output: {
        recommendation: "approve",
        summary: "Ready.",
        checks: {
          assignment: { status: "pass", note: "Aligned." },
          accuracy: { status: "pass", note: "Supported." },
          headline: { status: "pass", note: "Supported." },
          structure: { status: "pass", note: "Coherent." },
          style: { status: "pass", note: "Clear." },
        },
        revisionInstructions: null,
      },
    }));
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "director-model" },
      limits: { maximumInputCharacters: 60_000 },
      generateStructured: generateStructured as StructuredModel["generateStructured"],
    };
    const appended: AgentRun[] = [];
    const workflow = createRunDirectorReview({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      profiles: { findById: vi.fn(async () => facts.director), list: vi.fn(), append: vi.fn() },
      runs: {
        append: vi.fn(async (run) => {
          appended.push(run);
          return { ok: true as const, run };
        }),
        listByStoryId: vi.fn(),
      },
      resolveModel: () => ({ ok: true, model }),
      createAgentRunId: () => agentRunId("director-run-38"),
      now: vi.fn().mockReturnValueOnce("start").mockReturnValue("end"),
    });
    await expect(
      workflow({ storyId: facts.inspection.story.id, requestedBy: facts.actor }),
    ).resolves.toMatchObject({ ok: true, run: { outcome: "succeeded" } });
    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          evidence: [
            expect.objectContaining({
              evidenceId: facts.preparationA,
              document: expect.objectContaining({ content: "Evidence A" }),
            }),
          ],
        }),
      }),
    );
    expect(JSON.stringify(appended[0]?.input)).not.toContain("Evidence A");
    expect(JSON.stringify(appended[0]?.input)).not.toContain("Evidence B");
  });

  it("fails safely before model execution when the exact evidence ID is unavailable", async () => {
    const facts = fixture();
    const generateStructured = vi.fn();
    const inspection = {
      ...facts.inspection,
      sources: [
        {
          ...facts.inspection.sources[0]!,
          preparations: facts.inspection.sources[0]!.preparations.slice(1),
        },
      ],
    };
    const workflow = createRunDirectorReview({
      inspections: { inspect: vi.fn(async () => ({ ok: true as const, inspection })) },
      profiles: { findById: vi.fn(async () => facts.director), list: vi.fn(), append: vi.fn() },
      runs: { append: vi.fn(), listByStoryId: vi.fn() },
      resolveModel: () => ({
        ok: true,
        model: {
          descriptor: { provider: "openrouter", model: "director" },
          limits: { maximumInputCharacters: 60_000 },
          generateStructured,
        } as never,
      }),
      createAgentRunId: () => agentRunId("unused"),
      now: () => "now",
    });
    await expect(
      workflow({ storyId: inspection.story.id, requestedBy: facts.actor }),
    ).resolves.toMatchObject({ ok: false, error: { code: "DIRECTOR_EVIDENCE_UNAVAILABLE" } });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("durably records a failed attempt without editorial mutation and allows retry", async () => {
    const facts = fixture();
    const generateStructured = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
      })
      .mockResolvedValueOnce({
        ok: true as const,
        output: {
          recommendation: "approve",
          summary: "Ready.",
          checks: {
            assignment: { status: "pass", note: "Aligned." },
            accuracy: { status: "pass", note: "Supported." },
            headline: { status: "pass", note: "Supported." },
            structure: { status: "pass", note: "Coherent." },
            style: { status: "pass", note: "Clear." },
          },
          revisionInstructions: null,
        },
      });
    const appended: AgentRun[] = [];
    const workflow = createRunDirectorReview({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      profiles: { findById: vi.fn(async () => facts.director), list: vi.fn(), append: vi.fn() },
      runs: {
        append: vi.fn(async (run) => {
          appended.push(run);
          return { ok: true as const, run };
        }),
        listByStoryId: vi.fn(),
      },
      resolveModel: () => ({
        ok: true,
        model: {
          descriptor: { provider: "openrouter", model: "director" },
          limits: { maximumInputCharacters: 60_000 },
          generateStructured,
        } as StructuredModel,
      }),
      createAgentRunId: vi
        .fn()
        .mockReturnValueOnce(agentRunId("failed-director"))
        .mockReturnValueOnce(agentRunId("successful-director")),
      now: () => "now",
    });

    await expect(
      workflow({ storyId: facts.inspection.story.id, requestedBy: facts.actor }),
    ).resolves.toMatchObject({
      ok: true,
      run: {
        outcome: "failed",
        failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
      },
    });
    await expect(
      workflow({ storyId: facts.inspection.story.id, requestedBy: facts.actor }),
    ).resolves.toMatchObject({ ok: true, run: { outcome: "succeeded" } });
    expect(appended.map(({ outcome }) => outcome)).toEqual(["failed", "succeeded"]);
    expect(facts.inspection.story.state).toBe("in_review");
    expect(facts.inspection.article?.revisions).toHaveLength(1);
    expect(facts.inspection.reviewDecisions).toEqual([]);
    expect(facts.inspection.transitions).toEqual([]);
  });
});
