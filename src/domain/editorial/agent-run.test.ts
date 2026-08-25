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
} from "./types";
import type { AgentRun } from "./agent-run-types";
import { recordAgentRun } from "./agent-run";

const successful: AgentRun = {
  id: agentRunId("run-0030"),
  storyId: storyId("story-0030"),
  profileId: agentProfileId("storyrail-assignment-editor-v1"),
  role: "assignment_editor",
  operation: "assignment_proposal",
  model: { provider: "openrouter", model: "provider/model" },
  prompt: { key: "storyrail_assignment_editor", version: "1" },
  requestedBy: { type: "operator", operatorId: operatorId("operator-0030") },
  startedAt: "started",
  completedAt: "completed",
  input: {
    story: {
      id: storyId("story-0030"),
      title: "Story",
      state: "intake",
      revisionCycle: 0,
    },
    evidence: [
      {
        sourceId: sourceId("source-0030"),
        relevance: "Primary report",
        evidenceKind: "prepared",
        evidenceId: sourceEvidencePreparationId("prepared-0030"),
      },
    ],
    unavailableSourceIds: [sourceId("source-unavailable")],
    writerProfileIds: [agentProfileId("writer-0030")],
  },
  outcome: "succeeded",
  proposal: {
    writerProfileId: agentProfileId("writer-0030"),
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    reason: "Reason",
  },
};

describe("AgentRun", () => {
  it("accepts editor_in_chief article_review success and failure", () => {
    const common = {
      id: agentRunId("director-run-38"),
      storyId: storyId("story-38"),
      profileId: agentProfileId("storyrail-director-v1"),
      role: "editor_in_chief" as const,
      operation: "article_review" as const,
      model: { provider: "openrouter", model: "director-model" },
      prompt: { key: "storyrail_director_review", version: "1" },
      requestedBy: { type: "operator" as const, operatorId: operatorId("operator-38") },
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: {
          id: storyId("story-38"),
          title: "Story",
          state: "in_review" as const,
          revisionCycle: 0,
        },
        assignment: {
          id: assignmentId("assignment-38"),
          storyId: storyId("story-38"),
          writerProfileId: agentProfileId("writer-38"),
          sourceIds: [sourceId("source-38")],
          angle: "Angle",
          brief: "Brief",
          constraints: null,
        },
        article: { id: articleId("article-38"), assignmentId: assignmentId("assignment-38") },
        revision: {
          id: articleRevisionId("revision-38"),
          articleId: articleId("article-38"),
          revisionNumber: 1 as const,
          writerProfileId: agentProfileId("writer-38"),
          agentRunId: agentRunId("writer-run-38"),
          headline: "Headline",
          dek: null,
          bodyMarkdown: "Body",
        },
        evidence: [
          {
            sourceId: sourceId("source-38"),
            relevance: "Primary",
            evidenceKind: "prepared" as const,
            evidenceId: sourceEvidencePreparationId("preparation-38"),
          },
        ],
        unavailableSourceIds: [],
      },
    };
    const run: AgentRun = {
      ...common,
      outcome: "succeeded",
      review: {
        recommendation: "approve",
        summary: "Ready.",
        checks: {
          assignment: { status: "pass", note: "Aligned.", quoted: "Quoted from the Article." },
          support: {
            status: "pass" as const,
            note: "Each claim follows from its passage.",
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
    expect(recordAgentRun(run)).toMatchObject({ ok: true });
    expect(
      recordAgentRun({
        ...common,
        outcome: "failed",
        failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
      }),
    ).toMatchObject({ ok: true });
    expect(recordAgentRun({ ...run, role: "writer" } as never)).toMatchObject({
      ok: false,
      error: { code: "AGENT_RUN_ROLE_OPERATION_INVALID" },
    });
  });
  it("accepts Writer article_draft success references and rejects a mismatched operation", () => {
    const writerRun = {
      id: agentRunId("writer-run-31"),
      storyId: storyId("story-31"),
      profileId: agentProfileId("writer-31"),
      role: "writer" as const,
      operation: "article_draft" as const,
      model: { provider: "openrouter", model: "writer-model" },
      prompt: { key: "storyrail_writer_draft", version: "1" },
      requestedBy: { type: "operator" as const, operatorId: operatorId("operator-31") },
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: {
          id: storyId("story-31"),
          title: "Story",
          state: "assigned" as const,
          revisionCycle: 0,
        },
        assignment: {
          id: assignmentId("assignment-31"),
          storyId: storyId("story-31"),
          writerProfileId: agentProfileId("writer-31"),
          sourceIds: [sourceId("source-31")],
          angle: "Angle",
          brief: "Brief",
          constraints: null,
        },
        evidence: [
          {
            sourceId: sourceId("source-31"),
            relevance: "Primary",
            evidenceKind: "raw" as const,
            evidenceId: sourceExtractionId("extraction-31"),
          },
        ],
        unavailableSourceIds: [],
      },
      outcome: "succeeded" as const,
      articleId: articleId("article-31"),
      revisionId: articleRevisionId("revision-31"),
    };
    expect(recordAgentRun(writerRun)).toMatchObject({ ok: true });
    expect(
      recordAgentRun({ ...writerRun, operation: "assignment_proposal" } as never),
    ).toMatchObject({ ok: false, error: { code: "AGENT_RUN_ROLE_OPERATION_INVALID" } });
  });
  it("records a valid successful run as a fresh immutable snapshot", () => {
    const result = recordAgentRun(successful);
    expect(result).toEqual({ ok: true, run: successful });
    if (result.ok) expect(result.run).not.toBe(successful);
  });

  it("records a valid failed run", () => {
    const { proposal: _proposal, ...common } = successful;
    void _proposal;
    expect(
      recordAgentRun({
        ...common,
        outcome: "failed",
        failure: { code: "MODEL_REQUEST_TIMED_OUT", retryable: true },
      }),
    ).toMatchObject({ ok: true, run: { outcome: "failed" } });
  });

  it("lets a correction that went out of scope say what it was asked to fix", () => {
    // The draft is refused for its original citations and the code only names the correction as
    // the reason it could not be rescued, so the findings are the half that says why the work was
    // refused. Rejecting them left the application unable to record its own failure at all: the
    // candidate was invalid, recording threw, and the in-flight run was orphaned as `running`
    // where it read as a hang rather than as the refusal it was.
    const { proposal: _proposal, ...common } = successful;
    void _proposal;
    const findings = [
      {
        blockIndex: 0,
        code: "CITATION_QUOTE_UNSUPPORTED" as const,
        citationIndex: 0,
        quote: "a passage the evidence does not carry",
        evidenceId: "evidence-1",
      },
    ];
    expect(
      recordAgentRun({
        ...common,
        outcome: "failed",
        failure: { code: "MODEL_CORRECTION_OUT_OF_SCOPE", retryable: true, findings },
      }),
    ).toMatchObject({ ok: true, run: { failure: { findings } } });
  });

  it("still refuses findings attached to a failure that is not about grounding", () => {
    const { proposal: _proposal, ...common } = successful;
    void _proposal;
    expect(
      recordAgentRun({
        ...common,
        outcome: "failed",
        failure: {
          code: "MODEL_REQUEST_TIMED_OUT",
          retryable: true,
          findings: [
            {
              blockIndex: 0,
              code: "CITATION_QUOTE_UNSUPPORTED" as const,
              citationIndex: 0,
              quote: "a passage the evidence does not carry",
              evidenceId: "evidence-1",
            },
          ],
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "AGENT_RUN_OUTCOME_INVALID" } });
  });

  it("rejects unsupported role/operation combinations and blank descriptors", () => {
    expect(
      recordAgentRun({ ...successful, operation: "other" } as unknown as AgentRun),
    ).toMatchObject({ ok: false, error: { code: "AGENT_RUN_ROLE_OPERATION_INVALID" } });
    expect(recordAgentRun({ ...successful, prompt: { key: "", version: "1" } })).toMatchObject({
      ok: false,
      error: { code: "AGENT_RUN_PROMPT_INVALID" },
    });
  });

  it("rejects duplicate or contradictory evidence references", () => {
    const reference = successful.input.evidence[0]!;
    expect(
      recordAgentRun({
        ...successful,
        input: { ...successful.input, evidence: [reference, reference] },
      }),
    ).toMatchObject({ ok: false, error: { code: "AGENT_RUN_EVIDENCE_DUPLICATE" } });
  });

  it("rejects malformed success and failure outcomes", () => {
    expect(
      recordAgentRun({ ...successful, proposal: { ...successful.proposal, brief: " " } }),
    ).toMatchObject({ ok: false, error: { code: "AGENT_RUN_OUTCOME_INVALID" } });
    expect(
      recordAgentRun({
        ...successful,
        outcome: "failed",
        failure: { code: "UNKNOWN", retryable: false },
      } as unknown as AgentRun),
    ).toMatchObject({ ok: false, error: { code: "AGENT_RUN_OUTCOME_INVALID" } });
  });
});
