import { describe, expect, it } from "vitest";

import { decodePostgresAgentRun } from "./postgres-agent-run-decoder";

const payload = {
  id: "run-decoder-0030",
  storyId: "story-decoder-0030",
  profileId: "storyrail-assignment-editor-v1",
  role: "assignment_editor",
  operation: "assignment_proposal",
  model: { provider: "openrouter", model: "provider/model" },
  prompt: { key: "storyrail_assignment_editor", version: "1" },
  requestedBy: { type: "operator", operatorId: "operator-decoder-0030" },
  startedAt: "started",
  completedAt: "completed",
  input: {
    story: { id: "story-decoder-0030", title: "Story", state: "intake", revisionCycle: 0 },
    evidence: [
      {
        sourceId: "source-decoder-0030",
        relevance: "Primary",
        evidenceKind: "raw",
        evidenceId: "extraction-decoder-0030",
      },
    ],
    unavailableSourceIds: [],
    writerProfileIds: ["writer-decoder-0030"],
  },
  outcome: "succeeded",
  proposal: {
    writerProfileId: "writer-decoder-0030",
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    reason: "Reason",
  },
};

function row(candidate: unknown = payload) {
  return {
    run_id: payload.id,
    story_id: payload.storyId,
    profile_id: payload.profileId,
    role: payload.role,
    operation: payload.operation,
    outcome: (candidate as typeof payload).outcome,
    payload: candidate,
  };
}

const REVISION_RUN = {
  id: "writer-run-41",
  storyId: payload.storyId,
  profileId: "writer-41",
  role: "writer",
  operation: "article_revision",
  model: { provider: "openrouter", model: "writer-model" },
  prompt: { key: "storyrail_writer_revision", version: "1" },
  requestedBy: payload.requestedBy,
  startedAt: "started",
  completedAt: "completed",
  input: {
    story: {
      id: payload.storyId,
      title: "Story",
      state: "changes_requested",
      revisionCycle: 1,
    },
    assignment: {
      id: "assignment-41",
      storyId: payload.storyId,
      writerProfileId: "writer-41",
      sourceIds: ["source-decoder-0030"],
      angle: "Angle",
      brief: "Brief",
      constraints: null,
    },
    article: { id: "article-41", assignmentId: "assignment-41" },
    revision: {
      id: "revision-1-41",
      articleId: "article-41",
      revisionNumber: 1,
      writerProfileId: "writer-41",
      agentRunId: "writer-run-1-41",
      headline: "Headline",
      dek: null,
      bodyMarkdown: "Body",
    },
    directorReview: {
      recommendation: "approve",
      summary: "Director considered it ready.",
      checks: {
        assignment: { status: "pass", note: "Aligned.", quoted: "Quoted from the Article." },
        support: {
          status: "pass",
          note: "Each claim follows.",
          quoted: "Quoted from the Article.",
        },
        accuracy: { status: "pass", note: "Supported.", quoted: "Quoted from the Article." },
        headline: { status: "pass", note: "Supported.", quoted: "Quoted from the Article." },
        structure: { status: "pass", note: "Coherent.", quoted: "Quoted from the Article." },
        style: { status: "pass", note: "Clear.", quoted: "Quoted from the Article." },
      },
      revisionInstructions: null,
    },
    reviewDecision: {
      id: "decision-41",
      storyId: payload.storyId,
      articleId: "article-41",
      revisionId: "revision-1-41",
      directorRunId: "director-run-41",
      decision: "request_changes",
      reason: "Operator requires one clarification.",
      decidedBy: payload.requestedBy,
      decidedAt: "decided",
    },
    evidence: [
      {
        sourceId: "source-decoder-0030",
        relevance: "Primary",
        evidenceKind: "raw",
        evidenceId: "extraction-decoder-0030",
      },
    ],
    unavailableSourceIds: [],
  },
  outcome: "succeeded",
  articleId: "article-41",
  revisionId: "revision-2-41",
};

describe("PostgreSQL AgentRun decoder", () => {
  it("strictly decodes successful and failed runs as fresh results", () => {
    const decoded = decodePostgresAgentRun(row());
    expect(decoded).toEqual(payload);
    expect(decoded).not.toBe(payload);
    const { proposal: _proposal, ...common } = payload;
    void _proposal;
    const failed = {
      ...common,
      outcome: "failed",
      failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
    };
    expect(decodePostgresAgentRun({ ...row(failed), outcome: "failed" })).toEqual(failed);
  });

  it("strictly decodes a Writer article_draft run", () => {
    const writer = {
      id: "writer-run-31",
      storyId: "story-decoder-0030",
      profileId: "writer-decoder-0030",
      role: "writer",
      operation: "article_draft",
      model: { provider: "openrouter", model: "writer-model" },
      prompt: { key: "storyrail_writer_draft", version: "1" },
      requestedBy: { type: "operator", operatorId: "operator-decoder-0030" },
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: { id: "story-decoder-0030", title: "Story", state: "assigned", revisionCycle: 0 },
        assignment: {
          id: "assignment-31",
          storyId: "story-decoder-0030",
          writerProfileId: "writer-decoder-0030",
          sourceIds: ["source-decoder-0030"],
          angle: "Angle",
          brief: "Brief",
          constraints: null,
        },
        evidence: [
          {
            sourceId: "source-decoder-0030",
            relevance: "Primary",
            evidenceKind: "raw",
            evidenceId: "extraction-decoder-0030",
          },
        ],
        unavailableSourceIds: [],
      },
      outcome: "succeeded",
      articleId: "article-31",
      revisionId: "revision-31",
    };
    expect(
      decodePostgresAgentRun({
        run_id: writer.id,
        story_id: writer.storyId,
        profile_id: writer.profileId,
        role: writer.role,
        operation: writer.operation,
        outcome: writer.outcome,
        payload: writer,
      }),
    ).toEqual(writer);
  });

  it("strictly decodes a Writer article_revision run", () => {
    const revision = REVISION_RUN;
    expect(
      decodePostgresAgentRun({
        run_id: revision.id,
        story_id: revision.storyId,
        profile_id: revision.profileId,
        role: revision.role,
        operation: revision.operation,
        outcome: revision.outcome,
        payload: revision,
      }),
    ).toEqual(revision);
  });

  it("decodes a Writer revision run that needed a correction turn", () => {
    // A revision goes through the same correction turn a draft does. Until both readers shared
    // one account of a run, this reader had no `corrected` on a revision at all, so a run the
    // newsroom had recorded correctly could not be read back out of PostgreSQL.
    const corrected = {
      ...REVISION_RUN,
      corrected: [
        {
          blockIndex: 0,
          citationIndex: 0,
          code: "CITATION_QUOTE_UNSUPPORTED",
          quote: "A passage the evidence did not carry.",
          evidenceId: "extraction-decoder-0030",
        },
      ],
    };

    expect(
      decodePostgresAgentRun({
        run_id: corrected.id,
        story_id: corrected.storyId,
        profile_id: corrected.profileId,
        role: corrected.role,
        operation: corrected.operation,
        outcome: corrected.outcome,
        payload: corrected,
      }),
    ).toEqual(corrected);
  });

  it("strictly decodes a Director article_review run", () => {
    const director = {
      id: "director-run-38",
      storyId: payload.storyId,
      profileId: "storyrail-director-v1",
      role: "editor_in_chief",
      operation: "article_review",
      model: { provider: "openrouter", model: "director-model" },
      prompt: { key: "storyrail_director_review", version: "1" },
      requestedBy: payload.requestedBy,
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: { id: payload.storyId, title: "Story", state: "in_review", revisionCycle: 0 },
        assignment: {
          id: "assignment-38",
          storyId: payload.storyId,
          writerProfileId: "writer-38",
          sourceIds: ["source-decoder-0030"],
          angle: "Angle",
          brief: "Brief",
          constraints: null,
        },
        article: { id: "article-38", assignmentId: "assignment-38" },
        revision: {
          id: "revision-38",
          articleId: "article-38",
          revisionNumber: 1,
          writerProfileId: "writer-38",
          agentRunId: "writer-run-38",
          headline: "Headline",
          dek: null,
          bodyMarkdown: "Body",
        },
        evidence: [
          {
            sourceId: "source-decoder-0030",
            relevance: "Primary",
            evidenceKind: "raw",
            evidenceId: "extraction-decoder-0030",
          },
        ],
        unavailableSourceIds: [],
      },
      outcome: "succeeded",
      review: {
        recommendation: "approve",
        summary: "Ready.",
        checks: {
          assignment: { status: "pass", note: "Aligned.", quoted: "Quoted from the Article." },
          support: {
            status: "pass",
            note: "Each claim follows.",
            quoted: "Quoted from the Article.",
          },
          accuracy: { status: "pass", note: "Supported.", quoted: "Quoted from the Article." },
          headline: { status: "pass", note: "Supported.", quoted: "Quoted from the Article." },
          structure: { status: "pass", note: "Coherent.", quoted: "Quoted from the Article." },
          style: { status: "pass", note: "Clear.", quoted: "Quoted from the Article." },
        },
        revisionInstructions: null,
      },
    };
    expect(
      decodePostgresAgentRun({
        run_id: director.id,
        story_id: director.storyId,
        profile_id: director.profileId,
        role: director.role,
        operation: director.operation,
        outcome: director.outcome,
        payload: director,
      }),
    ).toEqual(director);
    expect(() =>
      decodePostgresAgentRun({
        run_id: director.id,
        story_id: director.storyId,
        profile_id: director.profileId,
        role: director.role,
        operation: director.operation,
        outcome: director.outcome,
        payload: {
          ...director,
          review: { ...director.review, revisionInstructions: "Unexpected" },
        },
      }),
    ).toThrowError(expect.objectContaining({ name: "PostgresAgentRunInvariantError" }));
  });

  it.each([
    { ...payload, extra: true },
    { ...payload, prompt: { ...payload.prompt, extra: true } },
    { ...payload, input: { ...payload.input, evidence: [] } },
    { ...payload, proposal: { ...payload.proposal, writerProfileId: "unknown" } },
  ])("rejects malformed payload %#", (candidate) => {
    expect(() => decodePostgresAgentRun(row(candidate))).toThrowError(
      expect.objectContaining({ name: "PostgresAgentRunInvariantError" }),
    );
  });
});
