"use client";

import { useDragDropMonitor, useDragOperation, useDroppable } from "@dnd-kit/react";
import { useMemo, useState } from "react";

import type { StoryInspection } from "@/application/story-inspection";
import {
  type AgentProfile,
  type AgentRun,
  type Assignment,
  type EditorialActor,
  type StoryTransitionReceipt,
} from "@/domain/editorial";

import { ArticleReader } from "./article-reader";
import { EditorialTaskPending } from "./editorial-task-pending";
import { STORY_STATE_LABELS } from "./newsroom-state";
import { WRITER_ASSIGNMENT_DROP_ID, WRITER_DRAG_TYPE, type StaffState } from "./newsroom-staff";
import styles from "./newsroom-shell.module.css";
import type { StoryClient } from "./story-client";

function actorLabel(actor: EditorialActor): string {
  return actor.type === "operator"
    ? `operator: ${actor.operatorId}`
    : `agent: ${actor.role}, run ${actor.runId}`;
}

function safeUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function AssignmentRuns({ runs }: Readonly<{ runs: readonly AgentRun[] }>) {
  const editorRuns = runs.filter(
    (run): run is Extract<AgentRun, { readonly role: "assignment_editor" }> =>
      run.role === "assignment_editor",
  );
  return (
    <section aria-labelledby="assignment-runs-heading">
      <h4 id="assignment-runs-heading">Assignment Editor runs</h4>
      {editorRuns.length === 0 ? (
        <p>No Assignment Editor runs are recorded.</p>
      ) : (
        editorRuns.map((run) => (
          <article key={run.id} className={styles.auditRecord}>
            <h5>{run.outcome === "succeeded" ? "Suggestion succeeded" : "Suggestion failed"}</h5>
            <dl className={styles.auditGrid}>
              <div>
                <dt>Run ID</dt>
                <dd>{run.id}</dd>
              </div>
              <div>
                <dt>Profile ID</dt>
                <dd>{run.profileId}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>
                  {run.model.provider} / {run.model.model}
                </dd>
              </div>
              <div>
                <dt>Prompt</dt>
                <dd>
                  {run.prompt.key} / {run.prompt.version}
                </dd>
              </div>
              <div>
                <dt>Requested by</dt>
                <dd>{actorLabel(run.requestedBy)}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{run.startedAt}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{run.completedAt}</dd>
              </div>
              <div>
                <dt>Outcome</dt>
                <dd>{run.outcome}</dd>
              </div>
              {run.outcome === "succeeded" ? (
                <>
                  <div>
                    <dt>Writer Profile</dt>
                    <dd>{run.proposal.writerProfileId}</dd>
                  </div>
                  <div>
                    <dt>Angle</dt>
                    <dd>{run.proposal.angle}</dd>
                  </div>
                  <div>
                    <dt>Brief</dt>
                    <dd>{run.proposal.brief}</dd>
                  </div>
                  <div>
                    <dt>Constraints</dt>
                    <dd>{run.proposal.constraints ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Reason</dt>
                    <dd>{run.proposal.reason}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>Failure code</dt>
                    <dd>{run.failure.code}</dd>
                  </div>
                  <div>
                    <dt>Retryable</dt>
                    <dd>{run.failure.retryable ? "Yes" : "No"}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Evidence references</dt>
                <dd>
                  {run.input.evidence.length === 0
                    ? "None"
                    : run.input.evidence
                        .map(
                          ({ sourceId, evidenceKind, evidenceId }) =>
                            `${sourceId}: ${evidenceKind} ${evidenceId}`,
                        )
                        .join(", ")}
                </dd>
              </div>
              <div>
                <dt>Unavailable Sources</dt>
                <dd>{run.input.unavailableSourceIds.join(", ") || "None"}</dd>
              </div>
            </dl>
          </article>
        ))
      )}
    </section>
  );
}

function WriterRuns({ runs }: Readonly<{ runs: readonly AgentRun[] }>) {
  const writerRuns = runs.filter(
    (run): run is Extract<AgentRun, { readonly role: "writer" }> => run.role === "writer",
  );
  return (
    <section aria-labelledby="writer-runs-heading">
      <h4 id="writer-runs-heading">Writer runs</h4>
      {writerRuns.length === 0 ? (
        <p>No Writer runs are recorded.</p>
      ) : (
        writerRuns.map((run) => (
          <article key={run.id} className={styles.auditRecord}>
            <h5>
              {run.operation === "article_draft" ? "Article draft" : "Article revision"} ·{" "}
              {run.outcome}
            </h5>
            <dl className={styles.auditGrid}>
              <div>
                <dt>Run ID</dt>
                <dd>{run.id}</dd>
              </div>
              <div>
                <dt>Writer Profile ID</dt>
                <dd>{run.profileId}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>
                  {run.model.provider} / {run.model.model}
                </dd>
              </div>
              <div>
                <dt>Prompt</dt>
                <dd>
                  {run.prompt.key} / {run.prompt.version}
                </dd>
              </div>
              <div>
                <dt>Assignment ID</dt>
                <dd>{run.input.assignment.id}</dd>
              </div>
              {run.operation === "article_revision" ? (
                <>
                  <div>
                    <dt>Previous Revision</dt>
                    <dd>{run.input.revision.id}</dd>
                  </div>
                  <div>
                    <dt>Operator request</dt>
                    <dd>{run.input.reviewDecision.reason}</dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt>Requested by</dt>
                <dd>{actorLabel(run.requestedBy)}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{run.startedAt}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{run.completedAt}</dd>
              </div>
              {run.outcome === "succeeded" ? (
                <>
                  <div>
                    <dt>Article ID</dt>
                    <dd>{run.articleId}</dd>
                  </div>
                  <div>
                    <dt>Revision ID</dt>
                    <dd>{run.revisionId}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>Failure</dt>
                    <dd>{run.failure.code}</dd>
                  </div>
                  <div>
                    <dt>Retryable</dt>
                    <dd>{run.failure.retryable ? "Yes" : "No"}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Evidence references</dt>
                <dd>
                  {run.input.evidence
                    .map(
                      ({ sourceId, evidenceKind, evidenceId }) =>
                        `${sourceId}: ${evidenceKind} ${evidenceId}`,
                    )
                    .join(", ") || "None"}
                </dd>
              </div>
              <div>
                <dt>Unavailable Sources</dt>
                <dd>{run.input.unavailableSourceIds.join(", ") || "None"}</dd>
              </div>
            </dl>
          </article>
        ))
      )}
    </section>
  );
}

function DirectorRuns({ runs }: Readonly<{ runs: readonly AgentRun[] }>) {
  const directorRuns = runs.filter(
    (run): run is Extract<AgentRun, { readonly role: "editor_in_chief" }> =>
      run.role === "editor_in_chief",
  );
  return (
    <section aria-labelledby="director-runs-heading">
      <h4 id="director-runs-heading">Director runs</h4>
      {directorRuns.length === 0 ? (
        <p>No Director runs are recorded.</p>
      ) : (
        directorRuns.map((run) => (
          <article key={run.id} className={styles.auditRecord}>
            <h5>Article review · {run.outcome}</h5>
            <dl className={styles.auditGrid}>
              <div>
                <dt>Run ID</dt>
                <dd>{run.id}</dd>
              </div>
              <div>
                <dt>Role / operation</dt>
                <dd>
                  {run.role} / {run.operation}
                </dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>
                  {run.model.provider} / {run.model.model}
                </dd>
              </div>
              <div>
                <dt>Prompt</dt>
                <dd>
                  {run.prompt.key} / {run.prompt.version}
                </dd>
              </div>
              <div>
                <dt>Revision ID</dt>
                <dd>{run.input.revision.id}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{run.startedAt}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{run.completedAt}</dd>
              </div>
              {run.outcome === "succeeded" ? (
                <>
                  <div>
                    <dt>Recommendation</dt>
                    <dd>{run.review.recommendation}</dd>
                  </div>
                  <div>
                    <dt>Summary</dt>
                    <dd>{run.review.summary}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>Failure</dt>
                    <dd>{run.failure.code}</dd>
                  </div>
                  <div>
                    <dt>Retryable</dt>
                    <dd>{run.failure.retryable ? "Yes" : "No"}</dd>
                  </div>
                </>
              )}
            </dl>
          </article>
        ))
      )}
    </section>
  );
}

function EvidencePanel({ inspection }: Readonly<{ inspection: StoryInspection }>) {
  return (
    <details className={styles.secondaryPanel}>
      <summary>
        <span>
          <strong>Evidence</strong>
          <small>Prepared evidence, relevance, and extraction history</small>
        </span>
        <span>
          {inspection.sources.length} {inspection.sources.length === 1 ? "Source" : "Sources"}
        </span>
      </summary>
      <div className={styles.secondaryPanelContent}>
        {inspection.sources.length === 0 ? <p>No Sources are attached to this Story.</p> : null}
        {inspection.sources.map(({ attachment, source, extractions, preparations }) => {
          const href = safeUrl(source.canonicalUrl);
          return (
            <article className={styles.evidenceCard} key={source.id}>
              <header>
                <div>
                  <p className={styles.currentTaskLabel}>Source</p>
                  <h4>
                    {href === null ? (
                      source.canonicalUrl
                    ) : (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {source.canonicalUrl}
                      </a>
                    )}
                  </h4>
                </div>
                <span>{preparations.length > 0 ? "Prepared" : "Raw"}</span>
              </header>
              <p>
                <strong>Relevance</strong> · {attachment.relevance}
              </p>
              {preparations.map((preparation, index) => (
                <details key={preparation.id} className={styles.evidenceDisclosure}>
                  <summary>
                    Prepared evidence attempt {index + 1} · {preparation.outcome}
                  </summary>
                  {preparation.outcome === "succeeded" ? (
                    <pre className={styles.extractedContent}>{preparation.document.content}</pre>
                  ) : (
                    <p>
                      {preparation.failure.code} · retryable:{" "}
                      {preparation.failure.retryable ? "yes" : "no"}
                    </p>
                  )}
                </details>
              ))}
              <details className={styles.evidenceDisclosure}>
                <summary>
                  Raw extraction history · {extractions.length}{" "}
                  {extractions.length === 1 ? "attempt" : "attempts"}
                </summary>
                {extractions.map((extraction, index) => (
                  <article key={extraction.id} className={styles.auditRecord}>
                    <h5>
                      Extraction attempt {index + 1} · {extraction.outcome}
                    </h5>
                    {extraction.outcome === "succeeded" ? (
                      <pre className={styles.extractedContent}>{extraction.document.content}</pre>
                    ) : (
                      <p>
                        {extraction.failure.code} · retryable:{" "}
                        {extraction.failure.retryable ? "yes" : "no"}
                      </p>
                    )}
                  </article>
                ))}
              </details>
            </article>
          );
        })}
      </div>
    </details>
  );
}

function AuditPanel({
  inspection,
  runs,
}: Readonly<{ inspection: StoryInspection; runs: readonly AgentRun[] }>) {
  const { story, sources, assignment, transitions, article, reviewDecisions } = inspection;
  return (
    <details className={styles.secondaryPanel}>
      <summary>
        <span>
          <strong>History &amp; Audit</strong>
          <small>Transitions, AgentRuns, durable records, and IDs</small>
        </span>
        <span>{transitions.length + runs.length + reviewDecisions.length} records</span>
      </summary>
      <div className={styles.secondaryPanelContent}>
        <section aria-labelledby="story-audit-heading">
          <h4 id="story-audit-heading">Technical Story details</h4>
          <dl className={styles.auditGrid}>
            <div>
              <dt>Story ID</dt>
              <dd>{story.id}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{story.createdAt}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{story.updatedAt}</dd>
            </div>
            <div>
              <dt>Revision cycle</dt>
              <dd>{story.revisionCycle}</dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="source-audit-heading">
          <h4 id="source-audit-heading">Evidence identities</h4>
          {sources.length === 0 ? (
            <p>No evidence identities are recorded.</p>
          ) : (
            sources.map(({ source, attachment, extractions, preparations }) => (
              <dl className={styles.auditGrid} key={source.id}>
                <div>
                  <dt>Source ID</dt>
                  <dd>{source.id}</dd>
                </div>
                <div>
                  <dt>Submitted URL</dt>
                  <dd>{source.submittedUrl}</dd>
                </div>
                <div>
                  <dt>Source provenance</dt>
                  <dd>{actorLabel(source.submittedBy)}</dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>{source.receivedAt}</dd>
                </div>
                <div>
                  <dt>Attached by</dt>
                  <dd>{actorLabel(attachment.attachedBy)}</dd>
                </div>
                <div>
                  <dt>Attached</dt>
                  <dd>{attachment.attachedAt}</dd>
                </div>
                <div>
                  <dt>Extraction IDs</dt>
                  <dd>{extractions.map(({ id }) => id).join(", ") || "None"}</dd>
                </div>
                <div>
                  <dt>Preparation IDs</dt>
                  <dd>{preparations.map(({ id }) => id).join(", ") || "None"}</dd>
                </div>
              </dl>
            ))
          )}
        </section>
        <section aria-labelledby="assignment-audit-heading">
          <h4 id="assignment-audit-heading">Technical Assignment record</h4>
          {assignment === null ? (
            <p>No durable Assignment is recorded.</p>
          ) : (
            <dl className={styles.auditGrid}>
              <div>
                <dt>Assignment ID</dt>
                <dd>{assignment.assignment.id}</dd>
              </div>
              <div>
                <dt>Writer Profile ID</dt>
                <dd>{assignment.assignment.writerProfileId}</dd>
              </div>
              <div>
                <dt>Source IDs</dt>
                <dd>{assignment.assignment.sourceIds.join(", ") || "None"}</dd>
              </div>
              <div>
                <dt>Assigned by</dt>
                <dd>{actorLabel(assignment.assignment.assignedBy)}</dd>
              </div>
              <div>
                <dt>Assigned at</dt>
                <dd>{assignment.assignment.assignedAt}</dd>
              </div>
            </dl>
          )}
        </section>
        <section aria-labelledby="transition-audit-heading">
          <h4 id="transition-audit-heading">Story transitions</h4>
          {transitions.length === 0 ? (
            <p>No durable Story transitions are recorded.</p>
          ) : (
            transitions.map((transition) => (
              <article key={transition.transitionId} className={styles.auditRecord}>
                <h5>
                  {STORY_STATE_LABELS[transition.previousState]} →{" "}
                  {STORY_STATE_LABELS[transition.nextState]}
                </h5>
                <dl className={styles.auditGrid}>
                  <div>
                    <dt>Transition ID</dt>
                    <dd>{transition.transitionId}</dd>
                  </div>
                  <div>
                    <dt>Actor</dt>
                    <dd>{actorLabel(transition.actor)}</dd>
                  </div>
                  <div>
                    <dt>Reason</dt>
                    <dd>{transition.reason}</dd>
                  </div>
                  <div>
                    <dt>Occurred</dt>
                    <dd>{transition.occurredAt}</dd>
                  </div>
                  <div>
                    <dt>Revision cycle</dt>
                    <dd>{transition.revisionCycle}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </section>
        <AssignmentRuns runs={runs} />
        <WriterRuns runs={runs} />
        <DirectorRuns runs={runs} />
        <section aria-labelledby="review-decisions-heading">
          <h4 id="review-decisions-heading">Operator review decisions</h4>
          {reviewDecisions.length === 0 ? (
            <p>No operator review decision is recorded.</p>
          ) : (
            reviewDecisions.map((decision) => (
              <article key={decision.id} className={styles.auditRecord}>
                <h5>{decision.decision === "approve" ? "Approved" : "Changes requested"}</h5>
                <dl className={styles.auditGrid}>
                  <div>
                    <dt>Decision ID</dt>
                    <dd>{decision.id}</dd>
                  </div>
                  <div>
                    <dt>Director run</dt>
                    <dd>{decision.directorRunId}</dd>
                  </div>
                  <div>
                    <dt>Revision ID</dt>
                    <dd>{decision.revisionId}</dd>
                  </div>
                  <div>
                    <dt>Decided by</dt>
                    <dd>{actorLabel(decision.decidedBy)}</dd>
                  </div>
                  <div>
                    <dt>Reason</dt>
                    <dd>{decision.reason}</dd>
                  </div>
                  <div>
                    <dt>Decided at</dt>
                    <dd>{decision.decidedAt}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </section>
        <section aria-labelledby="article-audit-heading">
          <h4 id="article-audit-heading">Technical Article record</h4>
          {article === null ? (
            <p>No durable Article is recorded.</p>
          ) : (
            <>
              <dl className={styles.auditGrid}>
                <div>
                  <dt>Article ID</dt>
                  <dd>{article.article.id}</dd>
                </div>
                <div>
                  <dt>Assignment ID</dt>
                  <dd>{article.article.assignmentId}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{article.article.createdAt}</dd>
                </div>
              </dl>
              {article.revisions.map((revision) => (
                <details className={styles.evidenceDisclosure} key={revision.id}>
                  <summary>Revision {revision.revisionNumber} source Markdown</summary>
                  <dl className={styles.auditGrid}>
                    <div>
                      <dt>Revision ID</dt>
                      <dd>{revision.id}</dd>
                    </div>
                    <div>
                      <dt>Writer Profile ID</dt>
                      <dd>{revision.writerProfileId}</dd>
                    </div>
                    <div>
                      <dt>AgentRun ID</dt>
                      <dd>{revision.agentRunId}</dd>
                    </div>
                    <div>
                      <dt>Created by</dt>
                      <dd>{actorLabel(revision.createdBy)}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{revision.createdAt}</dd>
                    </div>
                  </dl>
                  <pre className={styles.extractedContent}>{revision.bodyMarkdown}</pre>
                </details>
              ))}
            </>
          )}
        </section>
      </div>
    </details>
  );
}

export interface StoryWorkspaceProps {
  readonly inspection: StoryInspection;
  readonly notice?: string;
  readonly requests: StoryClient;
  readonly staff: StaffState;
  readonly onAssigned: (
    facts: {
      readonly assignment: Assignment;
      readonly story: StoryInspection["story"];
      readonly transitionReceipt: StoryTransitionReceipt;
    },
    writerProfile: AgentProfile,
  ) => Promise<void>;
  readonly onWriterCompleted: (inspection: StoryInspection) => void;
  readonly onReviewStateChanged: (inspection: StoryInspection) => void;
}

export function isWriterDropEligible(
  inspection: Pick<StoryInspection, "story" | "assignment">,
): boolean {
  return inspection.story.state === "intake" && inspection.assignment === null;
}

export function resolveWriterDropSelection(input: {
  readonly canceled: boolean;
  readonly targetId: string | number | null;
  readonly profile: unknown;
  readonly eligible: boolean;
  readonly proposalWriterProfileId?: string;
}): { readonly profile: AgentProfile; readonly recommendationChanged: boolean } | null {
  if (
    input.canceled ||
    input.targetId !== WRITER_ASSIGNMENT_DROP_ID ||
    !input.eligible ||
    typeof input.profile !== "object" ||
    input.profile === null ||
    Reflect.get(input.profile, "role") !== "writer"
  )
    return null;
  const profile = input.profile as AgentProfile;
  return {
    profile,
    recommendationChanged:
      input.proposalWriterProfileId !== undefined && input.proposalWriterProfileId !== profile.id,
  };
}

export function StoryWorkspace({
  inspection,
  notice,
  requests,
  staff,
  onAssigned,
  onWriterCompleted,
  onReviewStateChanged,
}: StoryWorkspaceProps) {
  const { story, sources, assignment, agentRuns, article } = inspection;
  const durableProposal = [...agentRuns]
    .reverse()
    .find(
      (
        run,
      ): run is Extract<
        AgentRun,
        { readonly role: "assignment_editor"; readonly outcome: "succeeded" }
      > => run.role === "assignment_editor" && run.outcome === "succeeded",
    );
  const profiles = useMemo(
    () =>
      staff.kind === "loaded" ? staff.profiles.filter((profile) => profile.role === "writer") : [],
    [staff],
  );
  const profilesUnavailable = staff.kind === "unavailable";
  const [assignmentPending, setAssignmentPending] = useState(false);
  const [proposalPending, setProposalPending] = useState(false);
  const [writerPending, setWriterPending] = useState(false);
  const [reviewSubmissionPending, setReviewSubmissionPending] = useState(false);
  const [directorPending, setDirectorPending] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [proposalReady, setProposalReady] = useState(durableProposal !== undefined);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [proposalStatus, setProposalStatus] = useState<string | null>(null);
  const [writerStatus, setWriterStatus] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [runs, setRuns] = useState<readonly AgentRun[]>(agentRuns);
  const latestProposal = [...runs]
    .reverse()
    .find(
      (
        run,
      ): run is Extract<
        AgentRun,
        { readonly role: "assignment_editor"; readonly outcome: "succeeded" }
      > => run.role === "assignment_editor" && run.outcome === "succeeded",
    );
  const [writerProfileId, setWriterProfileId] = useState(
    durableProposal?.proposal.writerProfileId ?? "",
  );
  const [angle, setAngle] = useState(durableProposal?.proposal.angle ?? "");
  const [brief, setBrief] = useState(durableProposal?.proposal.brief ?? "");
  const [constraints, setConstraints] = useState(durableProposal?.proposal.constraints ?? "");
  const [reason, setReason] = useState(durableProposal?.proposal.reason ?? "");
  const [writerOverridden, setWriterOverridden] = useState(false);
  const currentRevisionId = article?.revisions.at(-1)?.id;
  const successfulDirectorRun = [...runs]
    .reverse()
    .find(
      (
        run,
      ): run is Extract<
        AgentRun,
        { readonly role: "editor_in_chief"; readonly outcome: "succeeded" }
      > =>
        run.role === "editor_in_chief" &&
        run.outcome === "succeeded" &&
        run.input.revision.id === currentRevisionId,
    );
  const failedDirectorRun = [...runs]
    .reverse()
    .find(
      (
        run,
      ): run is Extract<
        AgentRun,
        { readonly role: "editor_in_chief"; readonly outcome: "failed" }
      > =>
        run.role === "editor_in_chief" &&
        run.outcome === "failed" &&
        run.input.revision.id === currentRevisionId,
    );
  const existingDecision = [...inspection.reviewDecisions]
    .reverse()
    .find((decision) => decision.revisionId === currentRevisionId);
  const [operatorDecision, setOperatorDecision] = useState<"approve" | "request_changes" | null>(
    existingDecision?.decision ?? null,
  );
  const [decisionReason, setDecisionReason] = useState(existingDecision?.reason ?? "");
  const assignmentEligible = isWriterDropEligible(inspection);
  const { ref: assignmentDropRef, isDropTarget } = useDroppable({
    id: WRITER_ASSIGNMENT_DROP_ID,
    type: "writer-assignment",
    accept: WRITER_DRAG_TYPE,
    disabled: !assignmentEligible,
  });
  const dragOperation = useDragOperation();
  const writerDragging = assignmentEligible && dragOperation.source?.type === WRITER_DRAG_TYPE;
  const selectedWriterProfileId = writerProfileId || profiles[0]?.id || "";

  useDragDropMonitor({
    onDragEnd(event) {
      const selection = resolveWriterDropSelection({
        canceled: event.canceled,
        targetId: event.operation.target?.id ?? null,
        profile: event.operation.source?.data.profile,
        eligible: assignmentEligible,
        proposalWriterProfileId: latestProposal?.proposal.writerProfileId,
      });
      if (selection === null) return;
      setWriterProfileId(selection.profile.id);
      setEditingAssignment(true);
      setWriterOverridden(selection.recommendationChanged);
    },
  });

  const proposedWriter = profiles.find((profile) => profile.id === selectedWriterProfileId);
  const currentSourceIds = new Set(sources.map(({ source }) => source.id));
  const proposalSourceIds = new Set(
    latestProposal === undefined
      ? []
      : [
          ...latestProposal.input.evidence.map(({ sourceId }) => sourceId),
          ...latestProposal.input.unavailableSourceIds,
        ],
  );
  const evidenceChanged =
    latestProposal !== undefined &&
    (currentSourceIds.size !== proposalSourceIds.size ||
      [...currentSourceIds].some((sourceId) => !proposalSourceIds.has(sourceId)));

  async function generateProposal() {
    if (proposalPending) return;
    setProposalPending(true);
    setProposalStatus(null);
    try {
      const result = await requests.generateAssignmentProposal(story.id);
      if (result.kind !== "completed") {
        setProposalStatus(
          result.kind === "application-failure" ? result.error.message : result.message,
        );
        return;
      }
      setRuns((current) => [...current, result.value]);
      if (result.value.role !== "assignment_editor") {
        setProposalStatus("The Assignment Editor returned an invalid execution record.");
        return;
      }
      if (result.value.outcome === "failed") {
        setProposalStatus(
          `Assignment Editor failed: ${result.value.failure.code}. Retryable: ${result.value.failure.retryable ? "yes" : "no"}.`,
        );
        return;
      }
      setWriterProfileId(result.value.proposal.writerProfileId);
      setAngle(result.value.proposal.angle);
      setBrief(result.value.proposal.brief);
      setConstraints(result.value.proposal.constraints ?? "");
      setReason(result.value.proposal.reason);
      setWriterOverridden(false);
      setProposalReady(true);
      setEditingAssignment(false);
      setProposalStatus("Assignment Editor suggestion ready for review.");
    } catch {
      setProposalStatus("The Assignment Editor request could not be completed.");
    } finally {
      setProposalPending(false);
    }
  }

  async function submitAssignment() {
    if (assignmentPending) return;
    setAssignmentPending(true);
    setSubmissionError(null);
    try {
      const result = await requests.assignStory(story.id, {
        writerProfileId: selectedWriterProfileId,
        angle,
        brief,
        constraints: constraints.trim().length === 0 ? null : constraints,
        reason,
      });
      if (result.kind !== "completed") {
        setSubmissionError(
          result.kind === "application-failure" ? result.error.message : result.message,
        );
        return;
      }
      const writer = profiles.find((profile) => profile.id === selectedWriterProfileId);
      if (!writer) {
        setSubmissionError("The selected Writer Profile is no longer available.");
        return;
      }
      await onAssigned(result.value, writer);
    } finally {
      setAssignmentPending(false);
    }
  }

  async function runWriter() {
    if (writerPending) return;
    setWriterPending(true);
    setWriterStatus(null);
    try {
      const result = await requests.createWriterDraft(story.id);
      if (result.kind !== "completed") {
        setWriterStatus(
          result.kind === "application-failure" ? result.error.message : result.message,
        );
        return;
      }
      setRuns((current) => [...current, result.value]);
      if (result.value.role !== "writer" || result.value.outcome === "failed") {
        if (result.value.role === "writer")
          setWriterStatus(
            `Writer failed: ${result.value.failure.code}. Retryable: ${result.value.failure.retryable ? "yes" : "no"}.`,
          );
        return;
      }
      const refreshed = await requests.inspectStory(story.id);
      if (refreshed.kind === "completed") onWriterCompleted(refreshed.value);
      else
        setWriterStatus(
          "Draft saved, but authoritative inspection refresh is unavailable. Reopen the Story.",
        );
    } catch {
      setWriterStatus("The Writer request could not be completed.");
    } finally {
      setWriterPending(false);
    }
  }

  async function runWriterRevision() {
    if (writerPending) return;
    setWriterPending(true);
    setWriterStatus(null);
    try {
      const result = await requests.createWriterRevision(story.id);
      if (result.kind !== "completed") {
        setWriterStatus(
          result.kind === "application-failure" ? result.error.message : result.message,
        );
        return;
      }
      setRuns((current) => [...current, result.value]);
      if (
        result.value.role !== "writer" ||
        result.value.operation !== "article_revision" ||
        result.value.outcome === "failed"
      ) {
        if (
          result.value.role === "writer" &&
          result.value.operation === "article_revision" &&
          result.value.outcome === "failed"
        )
          setWriterStatus(
            `Writer failed: ${result.value.failure.code}. Retryable: ${result.value.failure.retryable ? "yes" : "no"}.`,
          );
        return;
      }
      const refreshed = await requests.inspectStory(story.id);
      if (refreshed.kind === "completed") onWriterCompleted(refreshed.value);
      else
        setWriterStatus(
          "Revision saved, but authoritative inspection refresh is unavailable. Reopen the Story.",
        );
    } catch {
      setWriterStatus("The Writer revision request could not be completed.");
    } finally {
      setWriterPending(false);
    }
  }

  async function refreshAfterReviewChange(message: string) {
    const refreshed = await requests.inspectStory(story.id);
    if (refreshed.kind === "completed") onReviewStateChanged(refreshed.value);
    else setReviewStatus(message);
  }

  async function submitReview() {
    if (reviewSubmissionPending) return;
    setReviewSubmissionPending(true);
    setReviewStatus(null);
    try {
      const result = await requests.submitReview(story.id);
      if (result.kind !== "completed") {
        setReviewStatus(
          result.kind === "application-failure" ? result.error.message : result.message,
        );
        return;
      }
      await refreshAfterReviewChange(
        "Review submission saved, but authoritative inspection refresh is unavailable. Reopen the Story.",
      );
    } finally {
      setReviewSubmissionPending(false);
    }
  }

  async function runDirector() {
    if (directorPending) return;
    setDirectorPending(true);
    setReviewStatus(null);
    try {
      const result = await requests.runDirectorReview(story.id);
      if (result.kind !== "completed") {
        setReviewStatus(
          result.kind === "application-failure" ? result.error.message : result.message,
        );
        return;
      }
      setRuns((current) => [...current, result.value]);
      if (result.value.role !== "editor_in_chief") {
        setReviewStatus("The Director returned an invalid execution record.");
        return;
      }
      if (result.value.outcome === "failed") {
        setReviewStatus(
          `Director failed: ${result.value.failure.code}. Retryable: ${result.value.failure.retryable ? "yes" : "no"}.`,
        );
        return;
      }
      setOperatorDecision(result.value.review.recommendation);
      setDecisionReason(
        result.value.review.recommendation === "request_changes"
          ? (result.value.review.revisionInstructions ?? "")
          : "The current Article revision is approved for the next editorial stage.",
      );
      await refreshAfterReviewChange(
        "Director review saved, but authoritative inspection refresh is unavailable. Reopen the Story.",
      );
    } finally {
      setDirectorPending(false);
    }
  }

  async function recordDecision() {
    if (decisionPending || !successfulDirectorRun || !operatorDecision) return;
    setDecisionPending(true);
    setReviewStatus(null);
    try {
      const result = await requests.recordReviewDecision(story.id, {
        directorRunId: successfulDirectorRun.id,
        decision: operatorDecision,
        reason: decisionReason,
      });
      if (result.kind !== "completed") {
        setReviewStatus(
          result.kind === "application-failure" ? result.error.message : result.message,
        );
        return;
      }
      await refreshAfterReviewChange(
        "Review decision saved, but authoritative inspection refresh is unavailable. Reopen the Story.",
      );
    } finally {
      setDecisionPending(false);
    }
  }

  const latestRevision = article?.revisions.at(-1);
  return (
    <article className={styles.storyWorkspace} aria-labelledby="workspace-story-title">
      <header
        className={`${styles.storyWorkspaceHeader} ${article ? styles.storyWorkspaceHeaderCompact : ""}`}
      >
        <div>
          <p className={styles.sectionKicker}>Active work</p>
          <h1 id="workspace-story-title">{story.title}</h1>
          <div className={styles.storyMeta}>
            <span>
              {sources.length} {sources.length === 1 ? "Source" : "Sources"}
            </span>
            {assignment ? <span>Writer · {assignment.writerProfile.name}</span> : null}
          </div>
        </div>
        <span className={styles.stateBadge}>{STORY_STATE_LABELS[story.state]}</span>
      </header>
      {notice ? (
        <p role="status" className={styles.workspaceNotice}>
          {notice}
        </p>
      ) : null}

      <section
        ref={assignmentEligible ? assignmentDropRef : undefined}
        className={styles.currentTask}
        aria-labelledby="current-task-heading"
        aria-live="polite"
        data-writer-drop-eligible={writerDragging || undefined}
        data-writer-drop-over={isDropTarget || undefined}
      >
        {writerDragging ? (
          <div className={styles.assignmentDropCue} role="status">
            {isDropTarget
              ? "Release to choose this Writer"
              : "Drop a Writer here to start a manual Assignment"}
          </div>
        ) : null}
        {article !== null && latestRevision !== undefined ? (
          <div className={styles.articleReviewWorkspace}>
            <ArticleReader
              revision={latestRevision}
              writerName={assignment?.writerProfile.name ?? "Writer"}
              headingId="current-task-heading"
            />
            {story.state === "changes_requested" && writerPending ? (
              <EditorialTaskPending
                label="Current task · Writer revision"
                headline="Writer is revising the Article…"
                subtitle="Applying the operator decision against the exact historical evidence behind this revision."
                headingId="writer-revision-pending-heading"
              />
            ) : story.state === "in_progress" ? (
              <section className={styles.reviewTask} aria-labelledby="review-submission-heading">
                <p className={styles.currentTaskLabel}>Current task · Editorial review</p>
                <h2 id="review-submission-heading">Ready for review</h2>
                <p>Submit the current immutable Article revision to the Director review stage.</p>
                <button
                  type="button"
                  className={styles.primaryAction}
                  disabled={reviewSubmissionPending}
                  onClick={() => void submitReview()}
                >
                  {reviewSubmissionPending ? "Sending to Review…" : "Send to Review"}
                </button>
              </section>
            ) : story.state === "in_review" && directorPending ? (
              <EditorialTaskPending
                label="Current task · Director review"
                headline="Director is reviewing the Article…"
                subtitle="Checking the Assignment and exact evidence used by the Writer."
                headingId="director-review-pending-heading"
              />
            ) : story.state === "in_review" && !successfulDirectorRun ? (
              <section className={styles.reviewTask} aria-labelledby="director-task-heading">
                <p className={styles.currentTaskLabel}>Current task · Director review</p>
                <h2 id="director-task-heading">Director Review</h2>
                <p>
                  The Director will record an advisory recommendation without changing Story state
                  or Article content.
                </p>
                <button
                  type="button"
                  className={styles.primaryAction}
                  onClick={() => void runDirector()}
                >
                  {failedDirectorRun ? "Retry Director" : "Run Director"}
                </button>
              </section>
            ) : successfulDirectorRun ? (
              <section className={styles.directorReview} aria-labelledby="director-review-heading">
                <p className={styles.currentTaskLabel}>Director review</p>
                <h2 id="director-review-heading">
                  {successfulDirectorRun.review.recommendation === "approve"
                    ? "Approve"
                    : "Request changes"}
                </h2>
                <p>{successfulDirectorRun.review.summary}</p>
                <div className={styles.reviewChecks}>
                  {Object.entries(successfulDirectorRun.review.checks).map(([name, check]) => (
                    <article key={name}>
                      <h3>{name}</h3>
                      <strong>{check.status === "pass" ? "PASS" : "NEEDS CHANGES"}</strong>
                      <p>{check.note}</p>
                    </article>
                  ))}
                </div>
                {successfulDirectorRun.review.revisionInstructions ? (
                  <div className={styles.revisionInstructions}>
                    <h3>Revision instructions</h3>
                    <p>{successfulDirectorRun.review.revisionInstructions}</p>
                  </div>
                ) : null}
                {story.state === "in_review" && !existingDecision ? (
                  <form
                    className={styles.decisionForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void recordDecision();
                    }}
                  >
                    <fieldset>
                      <legend>Operator decision</legend>
                      <div className={styles.taskActions}>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          aria-pressed={operatorDecision === "approve"}
                          onClick={() => {
                            setOperatorDecision("approve");
                            setDecisionReason(
                              "The current Article revision is approved for the next editorial stage.",
                            );
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          aria-pressed={operatorDecision === "request_changes"}
                          onClick={() => {
                            setOperatorDecision("request_changes");
                            setDecisionReason(
                              successfulDirectorRun.review.revisionInstructions ?? "",
                            );
                          }}
                        >
                          Request changes
                        </button>
                      </div>
                    </fieldset>
                    {operatorDecision &&
                    operatorDecision !== successfulDirectorRun.review.recommendation ? (
                      <p role="status" className={styles.inlineAlert}>
                        Operator decision differs from the Director recommendation.
                      </p>
                    ) : null}
                    <label>
                      Reason
                      <textarea
                        value={decisionReason}
                        onChange={(event) => setDecisionReason(event.target.value)}
                        required
                        disabled={decisionPending}
                      />
                    </label>
                    <button
                      type="submit"
                      className={styles.primaryAction}
                      disabled={
                        decisionPending || !operatorDecision || decisionReason.trim().length === 0
                      }
                    >
                      {decisionPending ? "Recording decision…" : "Record decision"}
                    </button>
                  </form>
                ) : existingDecision ? (
                  <p className={styles.decisionResult}>
                    Operator decision:{" "}
                    <strong>
                      {existingDecision.decision === "approve" ? "APPROVED" : "CHANGES REQUESTED"}
                    </strong>{" "}
                    — {existingDecision.reason}
                  </p>
                ) : null}
                {story.state === "changes_requested" && !writerPending ? (
                  <section className={styles.reviewTask} aria-labelledby="writer-revision-heading">
                    <p className={styles.currentTaskLabel}>Current task · Writer revision</p>
                    <h3 id="writer-revision-heading">
                      Create Article Revision {(latestRevision?.revisionNumber ?? 1) + 1}
                    </h3>
                    <p>
                      The Writer will revise the current Article using the operator decision and the
                      exact historical evidence behind this revision.
                    </p>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      onClick={() => void runWriterRevision()}
                    >
                      Run Writer Revision
                    </button>
                  </section>
                ) : null}
                {story.state === "approved" ? (
                  <p className={styles.decisionResult}>
                    This Article revision is approved. Publishing is not part of this workflow.
                  </p>
                ) : null}
              </section>
            ) : null}
            {reviewStatus ? (
              <p
                role={reviewStatus.startsWith("Director failed") ? "alert" : "status"}
                className={styles.inlineAlert}
              >
                {reviewStatus}
              </p>
            ) : null}
            {writerStatus ? (
              <p
                role={writerStatus.startsWith("Writer failed") ? "alert" : "status"}
                className={styles.inlineAlert}
              >
                {writerStatus}
              </p>
            ) : null}
          </div>
        ) : story.state === "intake" && assignment === null ? (
          <>
            {proposalPending ? (
              <EditorialTaskPending
                label="Current task · Assignment Editor"
                headline="Assignment Editor is preparing a recommendation…"
                subtitle="Reviewing the Story, available evidence, and newsroom Writers."
                headingId="current-task-heading"
              />
            ) : proposalReady && !editingAssignment ? (
              <div className={styles.proposalCard}>
                <p className={styles.currentTaskLabel}>Assignment Editor suggestion</p>
                <div className={styles.proposalLead}>
                  <div>
                    <span>Recommended Writer</span>
                    <h2 id="current-task-heading">
                      {proposedWriter?.name ?? "Recommended Writer"}
                    </h2>
                  </div>
                  {proposedWriter ? (
                    <span className={styles.profilePill}>
                      {proposedWriter.builtIn ? "Built in" : "Custom"}
                    </span>
                  ) : null}
                </div>
                <div className={styles.editorialBrief}>
                  <section className={styles.briefAngle} aria-labelledby="proposal-angle-heading">
                    <h3 id="proposal-angle-heading">Angle</h3>
                    <p>{angle}</p>
                  </section>
                  <section className={styles.briefCopy} aria-labelledby="proposal-brief-heading">
                    <h3 id="proposal-brief-heading">Brief</h3>
                    <p>{brief}</p>
                  </section>
                  <details className={styles.briefDisclosure}>
                    <summary>Constraints</summary>
                    <p>{constraints || "None"}</p>
                  </details>
                  <aside
                    className={styles.editorialRationale}
                    aria-labelledby="proposal-reason-heading"
                  >
                    <h3 id="proposal-reason-heading">Why this assignment</h3>
                    <p>{reason}</p>
                  </aside>
                </div>
                {evidenceChanged ? (
                  <p role="alert" className={styles.inlineAlert}>
                    Story evidence has changed since this suggestion was generated. Regenerate
                    before relying on it.
                  </p>
                ) : null}
                <div className={styles.taskActions}>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    disabled={assignmentPending || selectedWriterProfileId.length === 0}
                    onClick={() => void submitAssignment()}
                  >
                    {assignmentPending ? "Creating Assignment…" : "Create Assignment"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => setEditingAssignment(true)}
                  >
                    Edit before assigning
                  </button>
                  <button
                    type="button"
                    className={styles.tertiaryAction}
                    onClick={() => void generateProposal()}
                  >
                    Regenerate
                  </button>
                </div>
                {submissionError ? (
                  <p role="alert" className={styles.inlineAlert}>
                    {submissionError}
                  </p>
                ) : null}
              </div>
            ) : editingAssignment ? (
              <form
                className={styles.assignmentEditorForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitAssignment();
                }}
              >
                <header>
                  <div>
                    <p className={styles.currentTaskLabel}>Assignment editing mode</p>
                    <h2 id="current-task-heading">Edit the Writer assignment</h2>
                  </div>
                  {latestProposal ? (
                    <button
                      type="button"
                      className={styles.tertiaryAction}
                      onClick={() => {
                        setEditingAssignment(false);
                        setWriterOverridden(false);
                        setWriterProfileId(latestProposal.proposal.writerProfileId);
                      }}
                    >
                      Back to suggestion
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.tertiaryAction}
                      disabled={proposalPending}
                      onClick={() => void generateProposal()}
                    >
                      {proposalPending ? "Assignment Editor is working…" : "Ask Assignment Editor"}
                    </button>
                  )}
                </header>
                {writerOverridden ? (
                  <p className={styles.writerOverrideNotice} role="status">
                    Writer recommendation changed locally. The Assignment Editor suggestion and its
                    editorial fields remain unchanged until you create the Assignment.
                  </p>
                ) : null}
                <p>Assignment will snapshot all currently attached Sources: {sources.length}</p>
                <label>
                  Writer
                  <select
                    value={selectedWriterProfileId}
                    onChange={(event) => {
                      setWriterProfileId(event.target.value);
                      setWriterOverridden(
                        latestProposal !== undefined &&
                          latestProposal.proposal.writerProfileId !== event.target.value,
                      );
                    }}
                    disabled={assignmentPending || profilesUnavailable}
                    required
                  >
                    {profiles.length === 0 ? <option value="">No Writers available</option> : null}
                    {profiles.map((profile) => (
                      <option value={profile.id} key={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Angle
                  <input
                    value={angle}
                    onChange={(event) => setAngle(event.target.value)}
                    disabled={assignmentPending}
                    required
                  />
                </label>
                <label>
                  Brief
                  <textarea
                    value={brief}
                    onChange={(event) => setBrief(event.target.value)}
                    disabled={assignmentPending}
                    required
                  />
                </label>
                <label>
                  Constraints (optional)
                  <textarea
                    value={constraints}
                    onChange={(event) => setConstraints(event.target.value)}
                    disabled={assignmentPending}
                  />
                </label>
                <label>
                  Assignment reason
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={assignmentPending}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className={styles.primaryAction}
                  disabled={assignmentPending || selectedWriterProfileId.length === 0}
                >
                  {assignmentPending ? "Creating Assignment…" : "Create Assignment"}
                </button>
                {profilesUnavailable ? <p role="alert">Writer Profiles are unavailable.</p> : null}
                {proposalStatus ? (
                  <p
                    role={
                      proposalStatus.startsWith("Assignment Editor failed") ? "alert" : "status"
                    }
                  >
                    {proposalStatus}
                  </p>
                ) : null}
                {submissionError ? <p role="alert">{submissionError}</p> : null}
              </form>
            ) : (
              <div className={styles.readyCard}>
                <p className={styles.currentTaskLabel}>Current task · Assignment</p>
                <h2 id="current-task-heading">Ready for assignment</h2>
                <p>
                  Ask the Assignment Editor to prepare a Writer recommendation and brief, or create
                  the Assignment manually.
                </p>
                <div className={styles.taskActions}>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    onClick={() => void generateProposal()}
                  >
                    Ask Assignment Editor
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => setEditingAssignment(true)}
                  >
                    Assign manually
                  </button>
                </div>
                {proposalStatus ? (
                  <p
                    role={
                      proposalStatus.startsWith("Assignment Editor failed") ? "alert" : "status"
                    }
                    className={styles.inlineAlert}
                  >
                    {proposalStatus}
                  </p>
                ) : null}
              </div>
            )}
          </>
        ) : story.state === "assigned" && assignment !== null ? (
          writerPending ? (
            <EditorialTaskPending
              label="Current task · Writer"
              headline="Writer is drafting the Article…"
              subtitle="Following the Assignment and exact evidence selected for this Story."
              headingId="current-task-heading"
            />
          ) : (
            <div className={styles.assignmentSummary}>
              <p className={styles.currentTaskLabel}>Current task · Writer execution</p>
              <h2 id="current-task-heading">Assignment ready</h2>
              <div className={styles.assignedWriter}>
                <span>Writer</span>
                <h3>{assignment.writerProfile.name}</h3>
              </div>
              <div className={styles.editorialBrief}>
                <section className={styles.briefAngle} aria-labelledby="assignment-angle-heading">
                  <h3 id="assignment-angle-heading">Angle</h3>
                  <p>{assignment.assignment.angle}</p>
                </section>
                <section className={styles.briefCopy} aria-labelledby="assignment-brief-heading">
                  <h3 id="assignment-brief-heading">Brief</h3>
                  <p>{assignment.assignment.brief}</p>
                </section>
                <details className={styles.briefDisclosure}>
                  <summary>Constraints</summary>
                  <p>{assignment.assignment.constraints ?? "None"}</p>
                </details>
              </div>
              <div className={styles.taskActions}>
                <button
                  type="button"
                  className={styles.primaryAction}
                  onClick={() => void runWriter()}
                >
                  Run Writer
                </button>
              </div>
              {writerStatus ? (
                <p
                  role={writerStatus.startsWith("Writer failed") ? "alert" : "status"}
                  className={styles.inlineAlert}
                >
                  {writerStatus}
                </p>
              ) : null}
            </div>
          )
        ) : (
          <div className={styles.readyCard}>
            <p className={styles.currentTaskLabel}>Current task</p>
            <h2 id="current-task-heading">{STORY_STATE_LABELS[story.state]}</h2>
            <p>This Story has no active work product for the current state.</p>
          </div>
        )}
      </section>

      <div className={styles.secondaryPanels}>
        <EvidencePanel inspection={inspection} />
        <AuditPanel inspection={inspection} runs={runs} />
      </div>
    </article>
  );
}
