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
