import { describe, expect, it, vi } from "vitest";

import { settleAgentRun } from "@/test/settle-agent-run";
import { createWriterDraft } from "./create-writer-draft";
import type { WriterDraftPersistence } from "./writer-draft-persistence";
import type { StructuredModel, StructuredModelRequest } from "@/application/model";
import {
  credentialUnavailable,
  OPENROUTER_API_KEY_SLOT,
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
      deliveries: [],
      toolCalls: [],
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
              input: { rawCharacters: 512, submittedCharacters: 512 },
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
  it("tells the Writer which newsroom it is writing for", async () => {
    // A Writer that knows who the newsroom serves pitches the piece at them, and the guard on
    // that context is what keeps it from becoming a licence to assert more than the evidence.
    const facts = fixture();
    const generateStructured = vi.fn(async () => ({
      ok: true as const,
      output: {
        headline: "Draft",
        dek: null,
        blocks: [
          {
            kind: "claim",
            markdown: "The evidence says so.",
            citations: [{ sourceId: "source-a", evidenceId: "prepared-a", quote: "Evidence" }],
          },
        ],
      },
    }));
    const workflow = createWriterDraft({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      runs: {
        append: vi.fn(async (run) => ({ ok: true as const, run })),
        complete: vi.fn(async (run) => ({ ok: true as const, run })),
        listByStoryId: vi.fn(),
      },
      persistence: {
        persist: vi.fn<WriterDraftPersistence["persist"]>(async (command) => ({
          ok: true as const,
          run: command.run,
          article: command.article,
          revision: command.revision,
          story: command.story,
          transitionReceipt: command.transitionReceipt,
        })),
      },
      resolveModel: async () => ({
        ok: true,
        model: {
          descriptor: { provider: "openrouter", model: "default-writer" },
          limits: { maximumInputCharacters: 60_000 },
          generateStructured:
            generateStructured as unknown as StructuredModel["generateStructured"],
        },
      }),
      createAgentRunId: () => agentRunId("run-31"),
      createArticleId: () => articleId("article-31"),
      createRevisionId: () => articleRevisionId("revision-31"),
      createTransitionId: () => transitionId("transition-31"),
      readNewsroomIdentity: async () => ({
        name: "Black Swamp AI",
        description: "Guides, Tips and News from the AI World",
      }),
      readNewsroomStandards: async () => "Headlines are sentence case.",
      now: () => "now",
    });

    await settleAgentRun(
      workflow({ storyId: facts.story.id, requestedBy: facts.assignment.assignedBy }),
    );

    const prompt = (
      generateStructured.mock.calls[0] as unknown as [StructuredModelRequest<unknown>]
    )[0].systemPrompt;
    expect(prompt).toContain("Black Swamp AI");
    expect(prompt).toContain("Guides, Tips and News from the AI World");
    expect(prompt).toContain("never relaxes the rules above about evidence");
    expect(prompt).toContain("Headlines are sentence case.");
  });

  it("uses prepared Assignment evidence, records unavailable Sources, and persists Revision 1", async () => {
    const facts = fixture();
    const generateStructured = vi.fn(async (request: StructuredModelRequest<unknown>) => {
      void request;
      return {
        ok: true as const,
        output: {
          headline: "Draft",
          dek: null,
          blocks: [
            {
              kind: "claim",
              markdown: "The evidence says so.",
              citations: [{ sourceId: "source-a", evidenceId: "prepared-a", quote: "Evidence" }],
            },
          ],
        },
      };
    });
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "default-writer" },
      limits: { maximumInputCharacters: 60_000 },
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
      runs: {
        append: vi.fn(async (run) => ({ ok: true as const, run })),
        complete: vi.fn(async (run) => ({ ok: true as const, run })),
        listByStoryId: vi.fn(),
      },
      persistence: { persist },
      resolveModel: async () => ({
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
    const result = await settleAgentRun(
      workflow({
        storyId: facts.story.id,
        requestedBy: facts.assignment.assignedBy,
      }),
    );
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
    const complete = vi.fn(async (run: AgentRun) => ({ ok: true as const, run }));
    const persist = vi.fn();
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "writer" },
      limits: { maximumInputCharacters: 60_000 },
      generateStructured: vi.fn(async () => ({
        ok: false as const,
        failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
      })) as StructuredModel["generateStructured"],
    };
    const workflow = createWriterDraft({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      runs: { append, complete, listByStoryId: vi.fn() },
      persistence: { persist },
      resolveModel: async () => ({
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
      await settleAgentRun(
        workflow({ storyId: facts.story.id, requestedBy: facts.assignment.assignedBy }),
      ),
    ).toMatchObject({ ok: true, run: { outcome: "failed" } });
    // The run is appended once while in flight, then completed with the failure.
    expect(append).toHaveBeenCalledOnce();
    expect(append.mock.calls[0]?.[0]).toMatchObject({ outcome: "running" });
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[0]).toMatchObject({ outcome: "failed" });
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a quote that is absent from the cited evidence",
      { sourceId: "source-a", evidenceId: "prepared-a", quote: "Never written anywhere" },
    ],
    [
      "evidence this Assignment does not have",
      { sourceId: "source-a", evidenceId: "prepared-elsewhere", quote: "Evidence" },
    ],
    [
      "a Source that does not own the cited evidence",
      { sourceId: "source-elsewhere", evidenceId: "prepared-a", quote: "Evidence" },
    ],
  ])("refuses a well-formed draft resting on %s", async (_label, citation) => {
    // The response parses perfectly; the claim simply is not supported. Nothing durable is
    // written, so an unverifiable assertion never reaches the Article at all.
    const facts = fixture();
    const complete = vi.fn(async (run: AgentRun) => ({ ok: true as const, run }));
    const persist = vi.fn();
    const model: StructuredModel = {
      descriptor: { provider: "openrouter", model: "writer" },
      limits: { maximumInputCharacters: 60_000 },
      generateStructured: vi.fn(async () => ({
        ok: true as const,
        output: {
          headline: "Draft",
          dek: null,
          blocks: [{ kind: "claim", markdown: "A confident assertion.", citations: [citation] }],
        },
      })) as StructuredModel["generateStructured"],
    };
    const workflow = createWriterDraft({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      runs: {
        append: vi.fn(async (run: AgentRun) => ({ ok: true as const, run })),
        complete,
        listByStoryId: vi.fn(),
      },
      persistence: { persist },
      resolveModel: async () => ({ ok: true, model }),
      createAgentRunId: () => agentRunId("run-ungrounded"),
      createArticleId: () => articleId("unused"),
      createRevisionId: () => articleRevisionId("unused"),
      createTransitionId: () => transitionId("unused"),
      now: () => "now",
    });

    expect(
      await settleAgentRun(
        workflow({ storyId: facts.story.id, requestedBy: facts.assignment.assignedBy }),
      ),
    ).toMatchObject({
      ok: true,
      run: { outcome: "failed", failure: { code: "MODEL_OUTPUT_UNGROUNDED", retryable: true } },
    });
    // The refusal records which citation it could not support, so the operator is not left with
    // a bare code and no way to see what went wrong.
    expect(complete.mock.calls[0]?.[0]).toMatchObject({
      failure: {
        findings: [{ blockIndex: 0, citationIndex: 0, quote: citation.quote }],
      },
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("records a correction that went out of scope instead of dying on the way to saying so", async () => {
    // The Writer is asked to fix one block and rewrites another nobody objected to. The draft is
    // refused, and the refusal has to reach the record: this once threw while building the failed
    // run, which left the in-flight run stranded at `running` where it read as a hung model rather
    // than as the refusal it was.
    const facts = fixture();
    const complete = vi.fn(async (run: AgentRun) => ({ ok: true as const, run }));
    const persist = vi.fn();
    const grounded = { sourceId: "source-a", evidenceId: "prepared-a", quote: "Evidence" };
    const ungrounded = {
      sourceId: "source-a",
      evidenceId: "prepared-a",
      quote: "Never written anywhere",
    };
    const generateStructured = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true as const,
        output: {
          headline: "Draft",
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
          headline: "Draft",
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
    const workflow = createWriterDraft({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      runs: {
        append: vi.fn(async (run: AgentRun) => ({ ok: true as const, run })),
        complete,
        listByStoryId: vi.fn(),
      },
      persistence: { persist },
      resolveModel: async () => ({ ok: true, model }),
      createAgentRunId: () => agentRunId("run-out-of-scope"),
      createArticleId: () => articleId("unused"),
      createRevisionId: () => articleRevisionId("unused"),
      createTransitionId: () => transitionId("unused"),
      now: () => "now",
    });

    expect(
      await settleAgentRun(
        workflow({ storyId: facts.story.id, requestedBy: facts.assignment.assignedBy }),
      ),
    ).toMatchObject({
      ok: true,
      run: { outcome: "failed", failure: { code: "MODEL_CORRECTION_OUT_OF_SCOPE" } },
    });
    // Both turns happened, and the failure still names the citation the correction was for.
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[0]).toMatchObject({
      outcome: "failed",
      failure: {
        code: "MODEL_CORRECTION_OUT_OF_SCOPE",
        findings: [{ blockIndex: 0, quote: ungrounded.quote }],
      },
    });
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
      await settleAgentRun(
        workflow({ storyId: facts.story.id, requestedBy: facts.assignment.assignedBy }),
      ),
    ).toMatchObject({ ok: false, error: { code: "WRITER_EVIDENCE_REQUIRED" } });
    expect(resolveModel).not.toHaveBeenCalled();
  });

  it("records no Agent Run when the newsroom has no OpenRouter key", async () => {
    const facts = fixture();
    const append = vi.fn();
    const workflow = createWriterDraft({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      runs: { append, complete: vi.fn(), listByStoryId: vi.fn() },
      persistence: { persist: vi.fn() },
      resolveModel: async () => ({
        ok: false as const,
        error: credentialUnavailable(
          OPENROUTER_API_KEY_SLOT,
          "CREDENTIAL_NOT_CONFIGURED",
          "No openrouter_api_key has been configured for this newsroom.",
        ),
      }),
      createAgentRunId: () => agentRunId("unused"),
      createArticleId: () => articleId("unused"),
      createRevisionId: () => articleRevisionId("unused"),
      createTransitionId: () => transitionId("unused"),
      now: () => "now",
    });

    const result = await settleAgentRun(
      workflow({ storyId: facts.story.id, requestedBy: facts.assignment.assignedBy }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "OPENROUTER_API_KEY_REQUIRED",
        reason: "CREDENTIAL_NOT_CONFIGURED",
        slot: "openrouter_api_key",
      },
    });
    // A run says a Writer was asked to write. None was, so recording one would be a fiction that
    // outlives the missing key.
    expect(append).not.toHaveBeenCalled();
  });
});
