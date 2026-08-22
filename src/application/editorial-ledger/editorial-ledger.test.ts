import { describe, expect, it } from "vitest";

import {
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
  type ArticleRevision,
} from "@/domain/editorial";

import { editorialLedger, revisionHistory } from "./editorial-ledger";

const STORY = storyId("story-ledger");
const WRITER = agentProfileId("writer-ledger");
const SOURCE = sourceId("source-ledger");
const PREPARED = sourceEvidencePreparationId("prepared-ledger");
const OPERATOR = { type: "operator" as const, operatorId: operatorId("operator-ledger") };
const ARTICLE = articleId("article-ledger");

const assignmentInput = {
  id: assignmentId("assignment-ledger"),
  storyId: STORY,
  writerProfileId: WRITER,
  sourceIds: [SOURCE],
  angle: "Angle",
  brief: "Brief",
  constraints: null,
};

const writerRun = (id: string, startedAt: string, completedAt: string | null): AgentRun =>
  ({
    id: agentRunId(id),
    storyId: STORY,
    profileId: WRITER,
    role: "writer",
    operation: "article_draft",
    model: { provider: "openrouter", model: "writer-model" },
    prompt: { key: "storyrail_writer_draft", version: "1" },
    requestedBy: OPERATOR,
    startedAt,
    completedAt,
    input: {
      story: { id: STORY, title: "Story", state: "assigned", revisionCycle: 0 },
      assignment: assignmentInput,
      evidence: [
        { sourceId: SOURCE, relevance: "Primary", evidenceKind: "prepared", evidenceId: PREPARED },
      ],
      unavailableSourceIds: [],
    },
    ...(completedAt === null
      ? { outcome: "running" }
      : {
          outcome: "failed",
          failure: { code: "MODEL_OUTPUT_UNGROUNDED", retryable: true },
        }),
  }) as AgentRun;

const transition = (at: string, previous: string, next: string) =>
  ({
    transitionId: transitionId(`transition-${at}`),
    storyId: STORY,
    previousState: previous,
    nextState: next,
    actor: OPERATOR,
    reason: "Because.",
    occurredAt: at,
  }) as never;

describe("reconstructing what happened to a Story", () => {
  it("interleaves runs, transitions, and decisions in the order they happened", () => {
    const ledger = editorialLedger({
      agentRuns: [writerRun("run-b", "2026-01-01T00:00:03.000Z", "2026-01-01T00:00:09.000Z")],
      transitions: [
        transition("2026-01-01T00:00:01.000Z", "intake", "assigned"),
        transition("2026-01-01T00:00:12.000Z", "assigned", "in_progress"),
      ],
      reviewDecisions: [],
    });

    expect(ledger.map((entry) => entry.title)).toEqual([
      "intake → assigned",
      "Writer drafted the Article",
      "assigned → in_progress",
    ]);
    // A run belongs where it finished, not where it started.
    expect(ledger[1]?.at).toBe("2026-01-01T00:00:09.000Z");
    expect(ledger[1]?.tookMs).toBe(6000);
  });

  it("carries the failure of a refused run so the reason is in the timeline", () => {
    const [entry] = editorialLedger({
      agentRuns: [writerRun("run-a", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:04.000Z")],
      transitions: [],
      reviewDecisions: [],
    });

    expect(entry).toMatchObject({
      outcome: "failed",
      failure: { code: "MODEL_OUTPUT_UNGROUNDED" },
      model: { model: "writer-model" },
    });
  });

  it("places a run that is still working at its start and reports no duration", () => {
    const [entry] = editorialLedger({
      agentRuns: [writerRun("run-live", "2026-01-01T00:00:00.000Z", null)],
      transitions: [],
      reviewDecisions: [],
    });

    expect(entry).toMatchObject({
      at: "2026-01-01T00:00:00.000Z",
      outcome: "running",
      detail: "Still running.",
      tookMs: null,
    });
  });

  it("keeps the recorded order when timestamps cannot be read", () => {
    // Fixtures and older records carry opaque timestamps; the append order is still the truth.
    const ledger = editorialLedger({
      agentRuns: [],
      transitions: [
        transition("second", "intake", "assigned"),
        transition("first", "assigned", "in_progress"),
      ],
      reviewDecisions: [],
    });

    expect(ledger.map((entry) => entry.title)).toEqual([
      "intake → assigned",
      "assigned → in_progress",
    ]);
  });
});

describe("what each Revision changed and what was asked of it", () => {
  const revision = (number: 1 | 2, id: string): ArticleRevision => ({
    id: articleRevisionId(id),
    articleId: ARTICLE,
    revisionNumber: number,
    writerProfileId: WRITER,
    agentRunId: agentRunId(`run-${id}`),
    headline: `Headline ${number}`,
    dek: null,
    blocks: [
      number === 1
        ? { kind: "context", markdown: "Unattributed prose.", citations: [] }
        : {
            kind: "claim",
            markdown: "Now attributed.",
            citations: [{ sourceId: SOURCE, evidenceId: PREPARED, quote: "The release shipped" }],
          },
    ],
    createdBy: { type: "agent", role: "writer", runId: agentRunId(`run-${id}`) },
    createdAt: `created-${number}`,
  });

  it("pairs a Revision with the instruction and decision that asked for it", () => {
    const directorRun = {
      id: agentRunId("director-ledger"),
      storyId: STORY,
      profileId: agentProfileId("storyrail-director-v1"),
      role: "editor_in_chief",
      operation: "article_review",
      model: { provider: "openrouter", model: "director-model" },
      prompt: { key: "storyrail_director_review", version: "1" },
      requestedBy: OPERATOR,
      startedAt: "start",
      completedAt: "end",
      input: {
        story: { id: STORY, title: "Story", state: "in_review", revisionCycle: 0 },
        assignment: assignmentInput,
        article: { id: ARTICLE, assignmentId: assignmentInput.id },
        revision: {
          id: articleRevisionId("revision-1"),
          articleId: ARTICLE,
          revisionNumber: 1,
          writerProfileId: WRITER,
          agentRunId: agentRunId("run-revision-1"),
          headline: "Headline 1",
          dek: null,
          bodyMarkdown: "Unattributed prose.",
        },
        evidence: [
          {
            sourceId: SOURCE,
            relevance: "Primary",
            evidenceKind: "prepared",
            evidenceId: PREPARED,
          },
        ],
        unavailableSourceIds: [],
      },
      outcome: "succeeded",
      review: {
        recommendation: "request_changes",
        summary: "Nothing is attributed.",
        checks: {} as never,
        revisionInstructions: "Attribute the claims to the evidence.",
      },
    } as unknown as AgentRun;

    const history = revisionHistory({
      article: {
        article: { id: ARTICLE } as never,
        revisions: [revision(1, "revision-1"), revision(2, "revision-2")],
      },
      agentRuns: [directorRun],
      sources: [],
      reviewDecisions: [
        {
          id: reviewDecisionId("decision-ledger"),
          storyId: STORY,
          articleId: ARTICLE,
          revisionId: articleRevisionId("revision-1"),
          directorRunId: agentRunId("director-ledger"),
          decision: "request_changes",
          reason: "Adopted the Director recommendation under autopilot.",
          decidedBy: OPERATOR,
          decidedAt: "decided",
        },
      ],
    });

    expect(history).toHaveLength(2);
    // The first Revision was not asked for by anyone.
    expect(history[0]).toMatchObject({ requestedBecause: null, directorInstruction: null });
    expect(history[1]).toMatchObject({
      requestedBecause: "Adopted the Director recommendation under autopilot.",
      directorInstruction: "Attribute the claims to the evidence.",
    });
  });

  it("measures each Revision so a rewrite can be seen to have improved its grounding", () => {
    const history = revisionHistory({
      article: {
        article: { id: ARTICLE } as never,
        revisions: [revision(1, "revision-1"), revision(2, "revision-2")],
      },
      agentRuns: [],
      sources: [],
      reviewDecisions: [],
    });

    expect(history[0]?.measurement.groundedShare).toBe(0);
    expect(history[1]?.measurement.groundedShare).toBe(1);
  });
});
