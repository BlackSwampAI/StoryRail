import {
  measureArticleGrounding,
  type AgentRun,
  type AgentRunFailure,
  type ArticleGroundingMeasurement,
  type ArticleRevision,
  type EditorialActor,
  type ModelDescriptor,
} from "@/domain/editorial";

import { evidenceBehindRevision } from "@/application/article-grounding";
import type { StoryInspection } from "@/application/story-inspection";

/**
 * One thing that happened to a Story, in the order it happened.
 *
 * The durable records already hold every step, but they are grouped by kind — runs here,
 * transitions there, decisions somewhere else — so reconstructing what actually occurred means
 * reading three lists against each other. This is that reconstruction, done once.
 */
export interface LedgerEntry {
  readonly at: string;
  readonly kind: "run" | "transition" | "decision";
  readonly title: string;
  readonly detail: string | null;
  readonly actor: EditorialActor;
  readonly outcome?: AgentRun["outcome"];
  readonly model?: ModelDescriptor;
  /** Milliseconds the run took, when both of its timestamps can be read. */
  readonly tookMs?: number | null;
  readonly failure?: AgentRunFailure;
}

const RUN_TITLES: Readonly<Record<string, string>> = {
  "researcher/source_research": "Researcher widened the evidence",
  "assignment_editor/assignment_proposal": "Assignment Editor proposed an Assignment",
  "writer/article_draft": "Writer drafted the Article",
  "writer/article_revision": "Writer revised the Article",
  "editor_in_chief/article_review": "Director reviewed the Article",
};

function elapsed(from: string, to: string | null): number | null {
  if (to === null) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isNaN(start) || Number.isNaN(end) ? null : end - start;
}

function runEntry(run: AgentRun): LedgerEntry {
  const title = RUN_TITLES[`${run.role}/${run.operation}`] ?? `${run.role} ${run.operation}`;
  return {
    // A run belongs in the timeline where it finished; one still running belongs at its start.
    at: run.completedAt ?? run.startedAt,
    kind: "run",
    title,
    detail:
      run.outcome === "succeeded" && run.role === "researcher"
        ? run.attached.length === 0
          ? "Nothing further was worth attaching."
          : `Attached ${run.attached.length} ${run.attached.length === 1 ? "Source" : "Sources"}: ${run.attached.map(({ url }) => url).join(", ")}`
        : run.outcome === "succeeded" && run.role === "editor_in_chief"
          ? run.review.summary
          : run.outcome === "running"
            ? "Still running."
            : null,
    actor: run.requestedBy,
    outcome: run.outcome,
    model: run.model,
    tookMs: elapsed(run.startedAt, run.completedAt),
    ...(run.outcome === "failed" ? { failure: run.failure } : {}),
  };
}

export function editorialLedger(
  inspection: Pick<StoryInspection, "agentRuns" | "transitions" | "reviewDecisions">,
): readonly LedgerEntry[] {
  const entries: LedgerEntry[] = [
    ...inspection.agentRuns.map(runEntry),
    ...inspection.transitions.map((transition) => ({
      at: transition.occurredAt,
      kind: "transition" as const,
      title: `${transition.previousState} → ${transition.nextState}`,
      detail: transition.reason,
      actor: transition.actor,
    })),
    ...inspection.reviewDecisions.map((decision) => ({
      at: decision.decidedAt,
      kind: "decision" as const,
      title: decision.decision === "approve" ? "Operator approved" : "Operator requested changes",
      detail: decision.reason,
      actor: decision.decidedBy,
    })),
  ];
  // Timestamps sort chronologically where they are readable; where two share a timestamp, or a
  // timestamp cannot be read, the order the records were appended in is preserved.
  return entries
    .map((entry, index) => ({ entry, index, at: Date.parse(entry.at) }))
    .sort((left, right) =>
      Number.isNaN(left.at) || Number.isNaN(right.at) || left.at === right.at
        ? left.index - right.index
        : left.at - right.at,
    )
    .map(({ entry }) => entry);
}

/**
 * What a Revision changed, and what was asked of it.
 *
 * The interesting comparison in this system is not which words moved but whether the rewrite
 * became better grounded, so each Revision carries its measurement alongside the Director's
 * instruction and the operator decision that sent it back.
 */
export interface RevisionStep {
  readonly revision: ArticleRevision;
  readonly measurement: ArticleGroundingMeasurement;
  readonly requestedBecause: string | null;
  readonly directorInstruction: string | null;
}

export function revisionHistory(
  inspection: Pick<StoryInspection, "agentRuns" | "sources" | "reviewDecisions" | "article">,
): readonly RevisionStep[] {
  const revisions = inspection.article?.revisions ?? [];
  return revisions.map((revision) => {
    // The decision that sent the previous Revision back is the one that asked for this one.
    const asking = inspection.reviewDecisions.find(
      (decision) =>
        decision.decision === "request_changes" &&
        decision.revisionId === revisions[revisions.indexOf(revision) - 1]?.id,
    );
    const directorRun = asking
      ? inspection.agentRuns.find((run) => run.id === asking.directorRunId)
      : undefined;
    return {
      revision,
      measurement: measureArticleGrounding(
        revision.blocks,
        evidenceBehindRevision(inspection, revision),
      ),
      requestedBecause: asking?.reason ?? null,
      directorInstruction:
        directorRun?.role === "editor_in_chief" && directorRun.outcome === "succeeded"
          ? directorRun.review.revisionInstructions
          : null,
    };
  });
}
