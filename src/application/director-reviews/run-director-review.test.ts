import { describe, expect, it, vi } from "vitest";

import { settleAgentRun } from "@/test/settle-agent-run";
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
    blocks: [{ kind: "context" as const, markdown: "Body", citations: [] }],
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
          assignment: { status: "pass", note: "Aligned.", quoted: "Body" },
          support: {
            status: "pass" as const,
            note: "Each claim follows from its passage.",
            quoted: "Body",
          },
          accuracy: { status: "pass", note: "Supported.", quoted: "Body" },
          headline: { status: "pass", note: "Supported.", quoted: "Body" },
          structure: { status: "pass", note: "Coherent.", quoted: "Body" },
          style: { status: "pass", note: "Clear.", quoted: "Body" },
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
        complete: vi.fn(async (run) => {
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
      settleAgentRun(workflow({ storyId: facts.inspection.story.id, requestedBy: facts.actor })),
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

  it("refuses a review whose checks quote passages the Article does not contain", async () => {
    // The review parses, its statuses are coherent, and it judged a sentence nobody wrote. A
    // reviewer allowed to invent its evidence could refuse work over passages that do not exist.
    const facts = fixture();
    const check = (quoted: string) => ({ status: "pass" as const, note: "Fine.", quoted });
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "director-model" },
      limits: { maximumInputCharacters: 60_000 },
      generateStructured: vi.fn(async () => ({
        ok: true as const,
        output: {
          recommendation: "approve",
          summary: "Ready.",
          checks: {
            assignment: check("Body"),
            support: check("Body"),
            accuracy: check("A sentence the Writer never wrote"),
            headline: check("Body"),
            structure: check("Body"),
            style: check("Body"),
          },
          revisionInstructions: null,
        },
      })) as StructuredModel["generateStructured"],
    };
    const workflow = createRunDirectorReview({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      profiles: { findById: vi.fn(async () => facts.director), list: vi.fn(), append: vi.fn() },
      runs: {
        append: vi.fn(async (run) => ({ ok: true as const, run })),
        complete: vi.fn(async (run) => ({ ok: true as const, run })),
        listByStoryId: vi.fn(),
      },
      resolveModel: () => ({ ok: true, model }),
      createAgentRunId: () => agentRunId("director-run-ungrounded"),
      now: vi.fn().mockReturnValueOnce("start").mockReturnValue("end"),
    });

    await expect(
      settleAgentRun(workflow({ storyId: facts.inspection.story.id, requestedBy: facts.actor })),
    ).resolves.toMatchObject({
      ok: true,
      run: {
        outcome: "failed",
        failure: {
          code: "MODEL_OUTPUT_UNGROUNDED",
          retryable: true,
          // The refusal names the check that quoted wrongly, so the operator is not left
          // with a bare code and no way to see which part of the review was invented.
          unsupportedChecks: ["accuracy"],
        },
      },
    });
  });

  it("lets the headline check quote the headline", async () => {
    // Observed live: the headline check has nothing to point at but the headline, and verifying
    // against the body alone refused reviews for quoting the very thing they were asked to judge.
    const facts = fixture();
    const check = (quoted: string) => ({ status: "pass" as const, note: "Fine.", quoted });
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "director-model" },
      limits: { maximumInputCharacters: 60_000 },
      generateStructured: vi.fn(async () => ({
        ok: true as const,
        output: {
          recommendation: "approve",
          summary: "Ready.",
          checks: {
            assignment: check("Body"),
            support: check("Body"),
            accuracy: check("Body"),
            headline: check(facts.inspection.article.revisions[0]!.headline),
            structure: check("Body"),
            style: check("Body"),
          },
          revisionInstructions: null,
        },
      })) as StructuredModel["generateStructured"],
    };
    const workflow = createRunDirectorReview({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      profiles: { findById: vi.fn(async () => facts.director), list: vi.fn(), append: vi.fn() },
      runs: {
        append: vi.fn(async (run) => ({ ok: true as const, run })),
        complete: vi.fn(async (run) => ({ ok: true as const, run })),
        listByStoryId: vi.fn(),
      },
      resolveModel: () => ({ ok: true, model }),
      createAgentRunId: () => agentRunId("director-run-headline"),
      now: vi.fn().mockReturnValueOnce("start").mockReturnValue("end"),
    });

    await expect(
      settleAgentRun(workflow({ storyId: facts.inspection.story.id, requestedBy: facts.actor })),
    ).resolves.toMatchObject({ ok: true, run: { outcome: "succeeded" } });
  });

  it("shows the Director each claim with the passage it rests on, and the measurement", async () => {
    // Mechanical verification proves the quote exists. Whether the claim fairly follows from it
    // is the judgement the Director is for, so it has to be given both to make it.
    const facts = fixture();
    let shown: unknown = null;
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "director-model" },
      limits: { maximumInputCharacters: 60_000 },
      generateStructured: vi.fn(async (request: { input: unknown }) => {
        shown = request.input;
        return {
          ok: false as const,
          failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
        };
      }) as unknown as StructuredModel["generateStructured"],
    };
    const workflow = createRunDirectorReview({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      profiles: { findById: vi.fn(async () => facts.director), list: vi.fn(), append: vi.fn() },
      runs: {
        append: vi.fn(async (run) => ({ ok: true as const, run })),
        complete: vi.fn(async (run) => ({ ok: true as const, run })),
        listByStoryId: vi.fn(),
      },
      resolveModel: () => ({ ok: true, model }),
      createAgentRunId: () => agentRunId("director-run-input"),
      now: vi.fn().mockReturnValueOnce("start").mockReturnValue("end"),
    });

    await settleAgentRun(
      workflow({ storyId: facts.inspection.story.id, requestedBy: facts.actor }),
    );

    expect(shown).toMatchObject({
      claims: expect.any(Array),
      grounding: expect.objectContaining({
        claimBlocks: expect.any(Number),
        contextBlocks: expect.any(Number),
        citations: expect.any(Number),
      }),
    });
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
      runs: { append: vi.fn(), complete: vi.fn(), listByStoryId: vi.fn() },
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
      settleAgentRun(workflow({ storyId: inspection.story.id, requestedBy: facts.actor })),
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
            assignment: { status: "pass", note: "Aligned.", quoted: "Body" },
            support: {
              status: "pass" as const,
              note: "Each claim follows from its passage.",
              quoted: "Body",
            },
            accuracy: { status: "pass", note: "Supported.", quoted: "Body" },
            headline: { status: "pass", note: "Supported.", quoted: "Body" },
            structure: { status: "pass", note: "Coherent.", quoted: "Body" },
            style: { status: "pass", note: "Clear.", quoted: "Body" },
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
        complete: vi.fn(async (run) => {
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
      settleAgentRun(workflow({ storyId: facts.inspection.story.id, requestedBy: facts.actor })),
    ).resolves.toMatchObject({
      ok: true,
      run: {
        outcome: "failed",
        failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
      },
    });
    await expect(
      settleAgentRun(workflow({ storyId: facts.inspection.story.id, requestedBy: facts.actor })),
    ).resolves.toMatchObject({ ok: true, run: { outcome: "succeeded" } });
    // Each attempt is recorded as in flight before the model is called, then completed.
    expect(appended.map(({ outcome }) => outcome)).toEqual([
      "running",
      "failed",
      "running",
      "succeeded",
    ]);
    expect(facts.inspection.story.state).toBe("in_review");
    expect(facts.inspection.article?.revisions).toHaveLength(1);
    expect(facts.inspection.reviewDecisions).toEqual([]);
    expect(facts.inspection.transitions).toEqual([]);
  });
});
