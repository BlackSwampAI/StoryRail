import { describe, expect, it, vi } from "vitest";

import { settleAgentRun } from "@/test/settle-agent-run";

import type { StructuredModel, StructuredModelRequest } from "@/application/model";
import type { StoryInspection } from "@/application/story-inspection";
import {
  articleBodyMarkdown,
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
  assignmentId,
  operatorId,
  reviewDecisionId,
  sourceEvidencePreparationId,
  sourceId,
  storyId,
  transitionId,
  type AgentRun,
} from "@/domain/editorial";
import { createWriterRevision } from "./create-writer-revision";
import type { WriterRevisionPersistence } from "./writer-revision-persistence";

function fixture(): StoryInspection {
  const operator = { type: "operator" as const, operatorId: operatorId("operator-41") };
  const story = {
    id: storyId("story-41"),
    title: "Changes Requested Story",
    state: "changes_requested" as const,
    revisionCycle: 1,
    createdAt: "created",
    updatedAt: "changes-requested",
  };
  const writerProfile = {
    id: agentProfileId("writer-41"),
    role: "writer" as const,
    name: "Writer",
    instructions: "Write precisely.",
    model: null,
    builtIn: true,
  };
  const assignment = {
    id: assignmentId("assignment-41"),
    storyId: story.id,
    writerProfileId: writerProfile.id,
    sourceIds: [sourceId("source-41")],
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    assignedBy: operator,
    assignedAt: "assigned",
  };
  const article = {
    id: articleId("article-41"),
    storyId: story.id,
    assignmentId: assignment.id,
    createdAt: "drafted",
  };
  const revision = {
    id: articleRevisionId("revision-1-41"),
    articleId: article.id,
    revisionNumber: 1 as const,
    writerProfileId: writerProfile.id,
    agentRunId: agentRunId("writer-run-1-41"),
    headline: "Original headline",
    dek: null,
    blocks: [{ kind: "context" as const, markdown: "Original body.", citations: [] }],
    createdBy: {
      type: "agent" as const,
      role: "writer" as const,
      runId: agentRunId("writer-run-1-41"),
    },
    createdAt: "drafted",
  };
  const reference = {
    sourceId: sourceId("source-41"),
    relevance: "Primary",
    evidenceKind: "prepared" as const,
    evidenceId: sourceEvidencePreparationId("preparation-41"),
  };
  const writerRun: AgentRun = {
    id: revision.agentRunId,
    storyId: story.id,
    profileId: writerProfile.id,
    role: "writer",
    operation: "article_draft",
    model: { provider: "openrouter", model: "writer" },
    prompt: { key: "storyrail_writer_draft", version: "1" },
    requestedBy: operator,
    startedAt: "writer-start",
    completedAt: "writer-end",
    input: {
      story: { id: story.id, title: story.title, state: "assigned", revisionCycle: 0 },
      assignment: {
        id: assignment.id,
        storyId: story.id,
        writerProfileId: writerProfile.id,
        sourceIds: assignment.sourceIds,
        angle: assignment.angle,
        brief: assignment.brief,
        constraints: null,
      },
      evidence: [reference],
      unavailableSourceIds: [],
    },
    outcome: "succeeded",
    articleId: article.id,
    revisionId: revision.id,
  };
  const review = {
    recommendation: "request_changes" as const,
    summary: "One claim needs support.",
    checks: {
      assignment: { status: "pass" as const, note: "Aligned.", quoted: "Quoted from the Article." },
      support: {
        status: "pass" as const,
        note: "Each claim follows from its passage.",
        quoted: "Quoted from the Article.",
      },
      accuracy: {
        status: "needs_changes" as const,
        note: "Support the claim.",
        quoted: "Quoted from the Article.",
      },
      headline: { status: "pass" as const, note: "Supported.", quoted: "Quoted from the Article." },
      structure: { status: "pass" as const, note: "Coherent.", quoted: "Quoted from the Article." },
      style: { status: "pass" as const, note: "Clear.", quoted: "Quoted from the Article." },
    },
    revisionInstructions: "Support the claim.",
  };
  const directorRun: AgentRun = {
    id: agentRunId("director-run-41"),
    storyId: story.id,
    profileId: agentProfileId("storyrail-director-v1"),
    role: "editor_in_chief",
    operation: "article_review",
    model: { provider: "openrouter", model: "director" },
    prompt: { key: "storyrail_director_review", version: "1" },
    requestedBy: operator,
    startedAt: "director-start",
    completedAt: "director-end",
    input: {
      story: { id: story.id, title: story.title, state: "in_review", revisionCycle: 0 },
      assignment: writerRun.input.assignment,
      article: { id: article.id, assignmentId: assignment.id },
      revision: {
        id: revision.id,
        articleId: article.id,
        revisionNumber: 1,
        writerProfileId: writerProfile.id,
        agentRunId: revision.agentRunId,
        headline: revision.headline,
        dek: null,
        bodyMarkdown: articleBodyMarkdown(revision.blocks),
      },
      evidence: [reference],
      unavailableSourceIds: [],
    },
    outcome: "succeeded",
    review,
  };
  const decision = {
    id: reviewDecisionId("decision-41"),
    storyId: story.id,
    articleId: article.id,
    revisionId: revision.id,
    directorRunId: directorRun.id,
    decision: "request_changes" as const,
    reason: "Add the supplied date and keep the rest unchanged.",
    decidedBy: operator,
    decidedAt: "changes-requested",
  };
  return {
    story,
    assignment: { assignment, writerProfile },
    article: { article, revisions: [revision] },
    agentRuns: [writerRun, directorRun],
    reviewDecisions: [decision],
    deliveries: [],
    toolCalls: [],
    transitions: [],
    sources: [
      {
        attachment: {
          storyId: story.id,
          sourceId: reference.sourceId,
          relevance: reference.relevance,
          attachedBy: operator,
          attachedAt: "attached",
        },
        source: {
          id: reference.sourceId,
          type: "url",
          submittedUrl: "https://example.test/story",
          canonicalUrl: "https://example.test/story" as never,
          submittedBy: operator,
          receivedAt: "received",
        },
        extractions: [],
        preparations: [
          {
            id: reference.evidenceId,
            sourceId: reference.sourceId,
            extractionId: "extraction-41" as never,
            model: { provider: "openrouter", model: "preparer" },
            preparer: { key: "prepare", version: "1" },
            input: { rawCharacters: 512, submittedCharacters: 512 },
            requestedBy: operator,
            startedAt: "prepare-start",
            completedAt: "prepare-end",
            outcome: "succeeded",
            document: {
              format: "markdown",
              content: "The supplied date is August 13.",
              title: null,
              byline: null,
              publishedAt: null,
              language: null,
            },
          },
        ],
      },
    ],
  };
}

describe("createWriterRevision", () => {
  it("tells the Writer which newsroom it is revising for", async () => {
    // A revision is written for the same readers as the draft, so the same context reaches it.
    const inspection = fixture();
    const generateStructured = vi.fn(async () => ({
      ok: true as const,
      output: {
        headline: "Revised headline",
        dek: null,
        blocks: [
          {
            kind: "claim",
            markdown: "The supplied date is August 13.",
            citations: [
              {
                sourceId: "source-41",
                evidenceId: "preparation-41",
                quote: "The supplied date is August 13.",
              },
            ],
          },
        ],
      },
    }));
    const workflow = createWriterRevision({
      inspections: { inspect: vi.fn(async () => ({ ok: true as const, inspection })) },
      runs: {
        append: vi.fn(async (run) => ({ ok: true as const, run })),
        complete: vi.fn(async (run) => ({ ok: true as const, run })),
        listByStoryId: vi.fn(),
      },
      persistence: {
        persist: vi.fn<WriterRevisionPersistence["persist"]>(async (command) => ({
          ok: true as const,
          run: command.run,
          revision: command.revision,
          story: command.story,
          transitionReceipt: command.transitionReceipt,
        })),
      },
      resolveModel: async () => ({
        ok: true,
        model: {
          descriptor: { provider: "openrouter", model: "writer" },
          limits: { maximumInputCharacters: 60_000 },
          generateStructured:
            generateStructured as unknown as StructuredModel["generateStructured"],
        },
      }),
      createAgentRunId: () => agentRunId("writer-run-2-41"),
      createRevisionId: () => articleRevisionId("revision-2-41"),
      createTransitionId: () => transitionId("transition-41"),
      readNewsroomIdentity: async () => ({
        name: "Black Swamp AI",
        description: "Guides, Tips and News from the AI World",
      }),
      readNewsroomStandards: async () => "Headlines are sentence case.",
      now: () => "now",
    });

    await settleAgentRun(
      workflow({
        storyId: inspection.story.id,
        requestedBy: { type: "operator", operatorId: operatorId("operator-41") },
      }),
    );

    const prompt = (
      generateStructured.mock.calls[0] as unknown as [StructuredModelRequest<unknown>]
    )[0].systemPrompt;
    expect(prompt).toContain("Black Swamp AI");
    expect(prompt).toContain("Guides, Tips and News from the AI World");
    expect(prompt).toContain("never relaxes the rules above about evidence");
    expect(prompt).toContain("Headlines are sentence case.");
  });

  it("uses the operator decision and exact historical evidence to persist Revision 2", async () => {
    const inspection = fixture();
    let generatedInput: unknown = null;
    const generateStructured = vi.fn(async (request: StructuredModelRequest<unknown>) => {
      generatedInput = request.input;
      return {
        ok: true as const,
        output: {
          headline: "Revised headline",
          dek: null,
          blocks: [
            {
              kind: "claim",
              markdown: "The supplied date is August 13.",
              citations: [
                {
                  sourceId: "source-41",
                  evidenceId: "preparation-41",
                  quote: "The supplied date is August 13.",
                },
              ],
            },
          ],
        },
      };
    });
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "writer" },
      limits: { maximumInputCharacters: 60_000 },
      generateStructured: generateStructured as StructuredModel["generateStructured"],
    };
    const persist = vi.fn<WriterRevisionPersistence["persist"]>(async (command) => ({
      ok: true as const,
      run: command.run,
      revision: command.revision,
      story: command.story,
      transitionReceipt: command.transitionReceipt,
    }));
    const workflow = createWriterRevision({
      inspections: { inspect: vi.fn(async () => ({ ok: true as const, inspection })) },
      runs: {
        append: vi.fn(async (run) => ({ ok: true as const, run })),
        complete: vi.fn(async (run) => ({ ok: true as const, run })),
        listByStoryId: vi.fn(),
      },
      persistence: { persist },
      resolveModel: async () => ({ ok: true, model }),
      createAgentRunId: () => agentRunId("writer-run-2-41"),
      createRevisionId: () => articleRevisionId("revision-2-41"),
      createTransitionId: () => transitionId("transition-41"),
      now: vi
        .fn()
        .mockReturnValueOnce("started")
        .mockReturnValueOnce("completed")
        .mockReturnValue("created"),
    });

    const result = await settleAgentRun(
      workflow({
        storyId: inspection.story.id,
        requestedBy: { type: "operator", operatorId: operatorId("operator-41") },
      }),
    );

    expect(generatedInput).toMatchObject({
      reviewDecision: { reason: "Add the supplied date and keep the rest unchanged." },
      evidence: [
        expect.objectContaining({
          document: expect.objectContaining({ content: expect.any(String) }),
        }),
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      run: { operation: "article_revision", outcome: "succeeded" },
      revision: { revisionNumber: 2 },
      story: { state: "in_progress", revisionCycle: 1 },
      transitionReceipt: { previousState: "changes_requested", nextState: "in_progress" },
    });
  });

  it("refuses a revision whose claim is not supported by the historical evidence", async () => {
    // A revision is held to the same standard as the draft it replaces: the Story stays in
    // changes_requested rather than advancing on an assertion nothing supports.
    const inspection = fixture();
    const persist = vi.fn();
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "writer" },
      limits: { maximumInputCharacters: 60_000 },
      generateStructured: vi.fn(async () => ({
        ok: true as const,
        output: {
          headline: "Revised headline",
          dek: null,
          blocks: [
            {
              kind: "claim",
              markdown: "The supplied date is September 2.",
              citations: [
                {
                  sourceId: "source-41",
                  evidenceId: "preparation-41",
                  quote: "The supplied date is September 2.",
                },
              ],
            },
          ],
        },
      })) as StructuredModel["generateStructured"],
    };
    const workflow = createWriterRevision({
      inspections: { inspect: vi.fn(async () => ({ ok: true as const, inspection })) },
      runs: {
        append: vi.fn(async (run) => ({ ok: true as const, run })),
        complete: vi.fn(async (run) => ({ ok: true as const, run })),
        listByStoryId: vi.fn(),
      },
      persistence: { persist },
      resolveModel: async () => ({ ok: true, model }),
      createAgentRunId: () => agentRunId("writer-run-ungrounded-41"),
      createRevisionId: () => articleRevisionId("unused"),
      createTransitionId: () => transitionId("unused"),
      now: () => "now",
    });

    expect(
      await settleAgentRun(
        workflow({
          storyId: inspection.story.id,
          requestedBy: { type: "operator", operatorId: operatorId("operator-41") },
        }),
      ),
    ).toMatchObject({
      ok: true,
      run: { outcome: "failed", failure: { code: "MODEL_OUTPUT_UNGROUNDED" } },
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("records a correction that went out of scope instead of dying on the way to saying so", async () => {
    // The same defect the draft path carried: building the failed run threw, so a refusal the
    // newsroom had already decided could never reach the record and the in-flight run was left
    // stranded at `running`.
    const inspection = fixture();
    const persist = vi.fn();
    const complete = vi.fn(async (run: AgentRun) => ({ ok: true as const, run }));
    const grounded = {
      sourceId: "source-41",
      evidenceId: "preparation-41",
      quote: "The supplied date is August 13.",
    };
    const ungrounded = { ...grounded, quote: "The supplied date is September 2." };
    const generateStructured = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true as const,
        output: {
          headline: "Revised headline",
          dek: null,
          blocks: [
            { kind: "claim", markdown: "The claim under objection.", citations: [ungrounded] },
            { kind: "claim", markdown: "A claim nobody objected to.", citations: [grounded] },
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true as const,
        output: {
          headline: "Revised headline",
          dek: null,
          blocks: [
            { kind: "claim", markdown: "The claim, now corrected.", citations: [grounded] },
            { kind: "claim", markdown: "Rewritten though nothing asked.", citations: [grounded] },
          ],
        },
      });
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "writer" },
      limits: { maximumInputCharacters: 60_000 },
      generateStructured: generateStructured as StructuredModel["generateStructured"],
    };
    const workflow = createWriterRevision({
      inspections: { inspect: vi.fn(async () => ({ ok: true as const, inspection })) },
      runs: {
        append: vi.fn(async (run) => ({ ok: true as const, run })),
        complete,
        listByStoryId: vi.fn(),
      },
      persistence: { persist },
      resolveModel: async () => ({ ok: true, model }),
      createAgentRunId: () => agentRunId("writer-run-out-of-scope-41"),
      createRevisionId: () => articleRevisionId("unused"),
      createTransitionId: () => transitionId("unused"),
      now: () => "now",
    });

    expect(
      await settleAgentRun(
        workflow({
          storyId: inspection.story.id,
          requestedBy: { type: "operator", operatorId: operatorId("operator-41") },
        }),
      ),
    ).toMatchObject({
      ok: true,
      run: { outcome: "failed", failure: { code: "MODEL_CORRECTION_OUT_OF_SCOPE" } },
    });
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0]?.[0]).toMatchObject({
      failure: {
        code: "MODEL_CORRECTION_OUT_OF_SCOPE",
        findings: [{ blockIndex: 0, quote: ungrounded.quote }],
      },
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects a revision whose number does not match the durable Story cycle", async () => {
    const inspection = fixture();
    const mismatched = {
      ...inspection,
      story: { ...inspection.story, revisionCycle: 2 },
    } as StoryInspection;
    const resolveModel = vi.fn();
    const workflow = createWriterRevision({
      inspections: { inspect: vi.fn(async () => ({ ok: true as const, inspection: mismatched })) },
      runs: {} as never,
      persistence: {} as never,
      resolveModel,
      createAgentRunId: () => agentRunId("unused"),
      createRevisionId: () => articleRevisionId("unused"),
      createTransitionId: () => transitionId("unused"),
      now: () => "unused",
    });

    await expect(
      settleAgentRun(
        workflow({
          storyId: mismatched.story.id,
          requestedBy: { type: "operator", operatorId: operatorId("operator-41") },
        }),
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "REVIEW_CONTEXT_MISMATCH" } });
    expect(resolveModel).not.toHaveBeenCalled();
  });
});
