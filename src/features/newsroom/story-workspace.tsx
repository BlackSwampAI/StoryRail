"use client";

import { useDragDropMonitor, useDragOperation, useDroppable } from "@dnd-kit/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { StoryInspection } from "@/application/story-inspection";
import {
  articleBodyMarkdown,
  type AgentProfile,
  type AgentRun,
  type AgentToolCall,
  type Assignment,
  type EditorialActor,
  type StoryTransitionReceipt,
} from "@/domain/editorial";

/** How often a Story with an in-flight agent run is re-inspected. */
const IN_FLIGHT_POLL_INTERVAL_MS = 1_500;

function isSuccessfulProposal(
  run: AgentRun,
): run is Extract<AgentRun, { readonly role: "assignment_editor"; readonly outcome: "succeeded" }> {
  return run.role === "assignment_editor" && run.outcome === "succeeded";
}

import { measureRevisionGrounding } from "@/application/article-grounding";
import { DEFAULT_RESEARCH_CALL_BUDGET } from "@/application/source-research";
import { editorialLedger, revisionHistory } from "@/application/editorial-ledger";

import { ArticleReader } from "./article-reader";
import { EditorialLedger } from "./editorial-ledger-panel";
import { EditorialTaskPending } from "./editorial-task-pending";
import { modelFailureMessage } from "./model-failure";
import {
  deliveryFailureMessage,
  deliveryNotAttemptedMessage,
  readDeliveries,
} from "./delivery-outcome";

/**
 * A refused draft is only useful if it says what it could not support, so each finding names the
 * problem and shows the passage the Writer claimed to be quoting.
 */
/**
 * Stated where the operator chooses, so the cost of asking for research is not a surprise, and
 * again against what a run has spent, so a thin result can be read as a budget rather than a
 * fault.
 */
const RESEARCH_CALL_BUDGET = DEFAULT_RESEARCH_CALL_BUDGET;

const GROUNDING_FINDING_LABELS = {
  CITATION_EVIDENCE_UNKNOWN: "Cited evidence not on this Assignment",
  CITATION_SOURCE_MISMATCH: "Source does not own the cited evidence",
  CITATION_QUOTE_UNSUPPORTED: "Not found in the cited evidence",
} as const;
import { autopilotProgress, resolveAutopilotFollow } from "./autopilot-follow";
import { withRun } from "./agent-run-list";
import { ToolActivity } from "./tool-activity";
import { readableTime } from "./readable-time";
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
              ) : run.outcome === "failed" ? (
                <>
                  <div>
                    <dt>Failure code</dt>
                    <dd>{run.failure.code}</dd>
                  </div>
                  <div>
                    <dt>Retryable</dt>
                    <dd>{run.failure.retryable ? "Yes" : "No"}</dd>
                  </div>
                  {run.failure.unsupportedChecks ? (
                    <div>
                      <dt>Checks quoting the Article wrongly</dt>
                      <dd>{run.failure.unsupportedChecks.join(", ")}</dd>
                    </div>
                  ) : null}
                  {run.failure.findings ? (
                    <div className={styles.groundingFindings}>
                      <dt>Unsupported citations</dt>
                      <dd>
                        <ol>
                          {run.failure.findings.map((finding) => (
                            <li key={`${finding.blockIndex}-${finding.citationIndex}`}>
                              <span>{GROUNDING_FINDING_LABELS[finding.code]}</span>
                              <q>{finding.quote}</q>
                            </li>
                          ))}
                        </ol>
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : (
                <div>
                  <dt>Status</dt>
                  <dd>Still running</dd>
                </div>
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
              ) : run.outcome === "failed" ? (
                <>
                  <div>
                    <dt>Failure</dt>
                    <dd>{run.failure.code}</dd>
                  </div>
                  <div>
                    <dt>Retryable</dt>
                    <dd>{run.failure.retryable ? "Yes" : "No"}</dd>
                  </div>
                  {run.failure.unsupportedChecks ? (
                    <div>
                      <dt>Checks quoting the Article wrongly</dt>
                      <dd>{run.failure.unsupportedChecks.join(", ")}</dd>
                    </div>
                  ) : null}
                  {run.failure.findings ? (
                    <div className={styles.groundingFindings}>
                      <dt>Unsupported citations</dt>
                      <dd>
                        <ol>
                          {run.failure.findings.map((finding) => (
                            <li key={`${finding.blockIndex}-${finding.citationIndex}`}>
                              <span>{GROUNDING_FINDING_LABELS[finding.code]}</span>
                              <q>{finding.quote}</q>
                            </li>
                          ))}
                        </ol>
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : (
                <div>
                  <dt>Status</dt>
                  <dd>Still running</dd>
                </div>
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
              ) : run.outcome === "failed" ? (
                <>
                  <div>
                    <dt>Failure</dt>
                    <dd>{run.failure.code}</dd>
                  </div>
                  <div>
                    <dt>Retryable</dt>
                    <dd>{run.failure.retryable ? "Yes" : "No"}</dd>
                  </div>
                  {run.failure.unsupportedChecks ? (
                    <div>
                      <dt>Checks quoting the Article wrongly</dt>
                      <dd>{run.failure.unsupportedChecks.join(", ")}</dd>
                    </div>
                  ) : null}
                  {run.failure.findings ? (
                    <div className={styles.groundingFindings}>
                      <dt>Unsupported citations</dt>
                      <dd>
                        <ol>
                          {run.failure.findings.map((finding) => (
                            <li key={`${finding.blockIndex}-${finding.citationIndex}`}>
                              <span>{GROUNDING_FINDING_LABELS[finding.code]}</span>
                              <q>{finding.quote}</q>
                            </li>
                          ))}
                        </ol>
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : (
                <div>
                  <dt>Status</dt>
                  <dd>Still running</dd>
                </div>
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
        <EditorialLedger
          entries={editorialLedger({ ...inspection, agentRuns: runs })}
          revisions={revisionHistory({ ...inspection, agentRuns: runs })}
        />
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
                  <pre className={styles.extractedContent}>
                    {articleBodyMarkdown(revision.blocks)}
                  </pre>
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
  const [rejectionPending, setRejectionPending] = useState(false);
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [publicationPending, setPublicationPending] = useState(false);
  const [publicationReason, setPublicationReason] = useState("");
  const [publicationStatus, setPublicationStatus] = useState<string | null>(null);
  const [deliveryPending, setDeliveryPending] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);
  const [deliveryConfirming, setDeliveryConfirming] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [proposalReady, setProposalReady] = useState(durableProposal !== undefined);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [proposalStatus, setProposalStatus] = useState<string | null>(null);
  const [writerStatus, setWriterStatus] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionStatus, setRejectionStatus] = useState<string | null>(null);
  const [runs, setRuns] = useState<readonly AgentRun[]>(agentRuns);
  // Tool calls arrive with the inspection and are refreshed by the same polls that follow the
  // runs, so the list grows while a run is still working rather than only once it has finished.
  const [toolCalls, setToolCalls] = useState<readonly AgentToolCall[]>(inspection.toolCalls);
  const [researchPending, setResearchPending] = useState(false);
  const [researchStatus, setResearchStatus] = useState<string | null>(null);
  const [autopilotPending, setAutopilotPending] = useState(false);
  const [autopilotResearch, setAutopilotResearch] = useState(false);
  const [autopilotStatus, setAutopilotStatus] = useState<string | null>(null);
  // What autopilot looked like when it was last seen moving. The durable record is the only
  // authority on where an automated run has reached, so following one means watching that
  // record advance rather than trusting a local flag.
  const [autopilotWatch, setAutopilotWatch] = useState<{
    readonly priorRunIds: ReadonlySet<string>;
    readonly progress: string;
    readonly observedAt: number;
  } | null>(null);

  // A run recorded as in flight is the authority on what is happening, not local component
  // state. Reopening the Story mid-run therefore rejoins it instead of showing an idle
  // workspace, and the operator can tell a slow run from a lost one.
  const runningOperations = useMemo(
    () =>
      new Set(
        runs
          .filter((run) => run.outcome === "running")
          .map((run) => `${run.role}/${run.operation}`),
      ),
    [runs],
  );
  const isRunning = useCallback(
    (role: AgentRun["role"], operation: AgentRun["operation"]) =>
      runningOperations.has(`${role}/${operation}`),
    [runningOperations],
  );
  const proposalRunning = proposalPending || isRunning("assignment_editor", "assignment_proposal");
  const researchRunning = researchPending || isRunning("researcher", "source_research");
  const draftRunning = writerPending || isRunning("writer", "article_draft");
  const revisionRunning = writerPending || isRunning("writer", "article_revision");
  const directorRunning = directorPending || isRunning("editor_in_chief", "article_review");
  const latestProposal = [...runs].reverse().find(isSuccessfulProposal);
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
  const revisionsExhausted = story.revisionCycle >= 2;
  const [operatorDecision, setOperatorDecision] = useState<"approve" | "request_changes" | null>(
    existingDecision?.decision ?? (revisionsExhausted ? "approve" : null),
  );
  const [decisionReason, setDecisionReason] = useState(existingDecision?.reason ?? "");
  const { standing: deliveryStanding, delivered: deliveredPost } = readDeliveries(
    inspection.deliveries,
  );
  // A destination that publishes live is not a draft a human still has to approve, so that one
  // is confirmed first. It is known from the record of what has already been sent there, which
  // is the only account of the destination this workspace holds.
  const destinationPublishesLive = inspection.deliveries.some(
    (delivery) => !delivery.request.draft,
  );
  const rejectionTransition = [...inspection.transitions]
    .reverse()
    .find((transition) => transition.nextState === "rejected");
  const editorialMutationPending =
    assignmentPending ||
    draftRunning ||
    revisionRunning ||
    reviewSubmissionPending ||
    directorRunning ||
    decisionPending;
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
      setRuns((current) => withRun(current, result.value));
      if (result.value.role !== "assignment_editor") {
        setProposalStatus("The Assignment Editor returned an invalid execution record.");
        return;
      }
      if (result.value.outcome === "failed") {
        setProposalStatus(modelFailureMessage("Assignment Editor", result.value.failure));
        return;
      }
      if (result.value.outcome === "running") {
        setProposalStatus(
          "Assignment Editor is still running. Reopen this Story to see the result.",
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
      setRuns((current) => withRun(current, result.value));
      if (result.value.role !== "writer" || result.value.outcome === "failed") {
        if (result.value.role === "writer")
          setWriterStatus(modelFailureMessage("Writer", result.value.failure));
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
      setRuns((current) => withRun(current, result.value));
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
          setWriterStatus(modelFailureMessage("Writer", result.value.failure));
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

  const anythingRunning = runningOperations.size > 0;
  useEffect(() => {
    if (!anythingRunning) return;
    let active = true;
    const timer = setInterval(() => {
      void (async () => {
        const refreshed = await requests.inspectStory(story.id);
        if (!active || refreshed.kind !== "completed") return;
        setRuns(refreshed.value.agentRuns);
        setToolCalls(refreshed.value.toolCalls);
        if (refreshed.value.agentRuns.some(isSuccessfulProposal)) setProposalReady(true);
        if (refreshed.value.agentRuns.every((run) => run.outcome !== "running")) {
          onWriterCompleted(refreshed.value);
        }
      })();
    }, IN_FLIGHT_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [anythingRunning, requests, story.id, onWriterCompleted]);

  const autopilotRunning = autopilotWatch !== null;
  // The in-flight poll above stops as soon as no run is running, which is true in every gap
  // between two autopilot steps. An automated run therefore needs its own follow: it keeps
  // inspecting the Story until publication, a failure, or a durable silence.
  useEffect(() => {
    if (autopilotWatch === null) return;
    let active = true;
    const timer = setInterval(() => {
      void (async () => {
        const refreshed = await requests.inspectStory(story.id);
        if (!active || refreshed.kind !== "completed") return;
        setRuns(refreshed.value.agentRuns);
        setToolCalls(refreshed.value.toolCalls);
        const progress = autopilotProgress(refreshed.value);
        const observedAt = Date.now();
        const moved = progress !== autopilotWatch.progress;
        const follow = resolveAutopilotFollow({
          inspection: refreshed.value,
          priorRunIds: autopilotWatch.priorRunIds,
          unchangedForMs: moved ? 0 : observedAt - autopilotWatch.observedAt,
        });
        if (follow.kind === "settled") {
          setAutopilotWatch(null);
          setAutopilotStatus(follow.message);
          onReviewStateChanged(refreshed.value);
          return;
        }
        if (moved) {
          setAutopilotWatch({ priorRunIds: autopilotWatch.priorRunIds, progress, observedAt });
          onReviewStateChanged(refreshed.value);
        }
      })();
    }, IN_FLIGHT_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [autopilotWatch, requests, story.id, onReviewStateChanged]);

  async function findMoreSources() {
    if (researchPending) return;
    setResearchPending(true);
    setResearchStatus("Researcher is looking for corroborating Sources…");
    try {
      const result = await requests.startSourceResearch(story.id);
      if (result.kind !== "completed") {
        setResearchStatus(
          result.kind === "application-failure"
            ? `Research could not start: ${result.error.message}`
            : "Research could not be started. Reopen this Story to check.",
        );
        return;
      }
      // Retrieval takes as long as the pages do, so the Story is followed rather than waited on.
      setAutopilotWatch({
        priorRunIds: new Set(runs.map((run) => run.id)),
        progress: autopilotProgress({ story, agentRuns: runs }),
        observedAt: Date.now(),
      });
    } catch {
      setResearchStatus("Research could not be started. Reopen this Story to check.");
    } finally {
      setResearchPending(false);
    }
  }

  async function startAutopilot() {
    if (autopilotPending || autopilotRunning) return;
    setAutopilotPending(true);
    setAutopilotStatus(null);
    try {
      const result = await requests.startAutopilot(story.id, { research: autopilotResearch });
      if (result.kind !== "completed") {
        setAutopilotStatus(
          result.kind === "application-failure"
            ? `Autopilot could not start: ${result.error.message}`
            : "Autopilot could not be started. Reopen this Story to check.",
        );
        return;
      }
      setAutopilotWatch({
        priorRunIds: new Set(runs.map((run) => run.id)),
        progress: autopilotProgress({ story, agentRuns: runs }),
        observedAt: Date.now(),
      });
      setAutopilotStatus(
        autopilotResearch
          ? "Autopilot is researching, then running this Story to publication. Every record is still written as you."
          : "Autopilot is running this Story to publication. Every record is still written as you.",
      );
    } catch {
      setAutopilotStatus("Autopilot could not be started. Reopen this Story to check.");
    } finally {
      setAutopilotPending(false);
    }
  }

  async function publish() {
    if (publicationPending) return;
    setPublicationPending(true);
    setPublicationStatus(null);
    try {
      const result = await requests.publishStory(story.id, publicationReason);
      if (result.kind !== "completed") {
        setPublicationStatus(
          result.kind === "application-failure"
            ? `Publish failed: ${result.error.message}`
            : "Publishing outcome is unavailable. Reopen this Story to confirm.",
        );
        return;
      }
      setPublicationOpen(false);
      setPublicationReason("");
      await refreshAfterReviewChange("Story published.");
    } finally {
      setPublicationPending(false);
    }
  }

  /**
   * Delivery is asked for, never assumed. A second one is an ordinary act rather than a retry —
   * it is how a later Revision reaches the post already made — so the action stays available
   * after a success and reads as an update to that post.
   */
  async function deliver() {
    if (deliveryPending) return;
    setDeliveryPending(true);
    setDeliveryStatus(null);
    try {
      const result = await requests.deliverStory(story.id);
      setDeliveryConfirming(false);
      if (result.kind === "unavailable") {
        setDeliveryStatus(
          "The delivery outcome is unavailable. Reopen this Story to see whether it was sent.",
        );
        return;
      }
      setDeliveryStatus(
        result.kind === "delivered"
          ? `Delivered to ${result.delivery.destination}.`
          : result.kind === "refused"
            ? deliveryFailureMessage(result.error)
            : result.kind === "not-attempted"
              ? deliveryNotAttemptedMessage(result.error)
              : result.error.message,
      );
      // The durable record is what the panel reads, so it is re-read rather than guessed at.
      const refreshed = await requests.inspectStory(story.id);
      if (refreshed.kind === "completed") onReviewStateChanged(refreshed.value);
    } catch {
      setDeliveryStatus(
        "The delivery outcome is unavailable. Reopen this Story to see whether it was sent.",
      );
    } finally {
      setDeliveryPending(false);
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
      setRuns((current) => withRun(current, result.value));
      if (result.value.role !== "editor_in_chief") {
        setReviewStatus("The Director returned an invalid execution record.");
        return;
      }
      if (result.value.outcome === "failed") {
        setReviewStatus(modelFailureMessage("Director review", result.value.failure));
        return;
      }
      if (result.value.outcome === "running") {
        setReviewStatus("Director review is still running. Reopen this Story to see the result.");
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

  async function rejectStory() {
    if (rejectionPending || rejectionReason.trim().length === 0) return;
    setRejectionPending(true);
    setRejectionStatus(null);
    try {
      const result = await requests.rejectStory(story.id, rejectionReason);
      if (result.kind !== "completed") {
        setRejectionStatus(
          result.kind === "application-failure" ? result.error.message : result.message,
        );
        return;
      }
      const rejectedInspection: StoryInspection = {
        ...inspection,
        story: result.value.story,
        transitions: [...inspection.transitions, result.value.transitionReceipt],
      };
      onReviewStateChanged(rejectedInspection);
      const refreshed = await requests.inspectStory(story.id);
      if (refreshed.kind === "completed") onReviewStateChanged(refreshed.value);
      else
        setRejectionStatus(
          "Rejection saved, but authoritative inspection refresh is unavailable. Reopen the Story.",
        );
    } finally {
      setRejectionPending(false);
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
      {researchStatus ? (
        <p
          role={researchStatus.startsWith("Research could not") ? "alert" : "status"}
          className={styles.workspaceNotice}
        >
          {researchStatus}
        </p>
      ) : null}
      {autopilotStatus ? (
        <p
          role={autopilotStatus.startsWith("Autopilot could not") ? "alert" : "status"}
          className={styles.workspaceNotice}
        >
          {autopilotStatus}
        </p>
      ) : null}
      <ToolActivity calls={toolCalls} runs={runs} budget={RESEARCH_CALL_BUDGET} />

      {story.state === "rejected" && rejectionTransition ? (
        <section className={styles.rejectionResult} aria-labelledby="story-rejected-heading">
          <h2 id="story-rejected-heading">Story rejected</h2>
          <p>{rejectionTransition.reason}</p>
          <dl className={styles.auditGrid}>
            <div>
              <dt>Rejected by</dt>
              <dd>{actorLabel(rejectionTransition.actor)}</dd>
            </div>
            <div>
              <dt>Rejected at</dt>
              <dd>{rejectionTransition.occurredAt}</dd>
            </div>
          </dl>
        </section>
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
              measurement={measureRevisionGrounding(inspection, latestRevision)}
              inspection={inspection}
            />
            {story.state === "changes_requested" && revisionRunning ? (
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
            ) : story.state === "approved" ? (
              <section className={styles.reviewTask} aria-labelledby="publication-heading">
                <p className={styles.currentTaskLabel}>Current task · Publication</p>
                <h2 id="publication-heading">Approved and ready to publish</h2>
                <p>
                  Publishing records the operator decision to release this Article and moves the
                  Story to its final state. StoryRail does not deliver the Article anywhere yet.
                </p>
                {!publicationOpen ? (
                  <button
                    type="button"
                    className={styles.primaryAction}
                    disabled={editorialMutationPending}
                    onClick={() => setPublicationOpen(true)}
                  >
                    Publish Story
                  </button>
                ) : (
                  <form
                    className={styles.decisionForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void publish();
                    }}
                  >
                    <label>
                      Publication reason
                      <textarea
                        value={publicationReason}
                        onChange={(event) => setPublicationReason(event.target.value)}
                        required
                        disabled={publicationPending}
                      />
                    </label>
                    <div className={styles.taskActions}>
                      <button
                        type="submit"
                        className={styles.primaryAction}
                        disabled={publicationPending || publicationReason.trim().length === 0}
                      >
                        {publicationPending ? "Publishing…" : "Publish Story"}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        disabled={publicationPending}
                        onClick={() => {
                          setPublicationOpen(false);
                          setPublicationReason("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {!publicationPending && publicationReason.trim().length === 0 ? (
                      <p className={styles.formHint}>
                        A reason is required before the Story can be published.
                      </p>
                    ) : null}
                  </form>
                )}
                {publicationStatus ? (
                  <p
                    role={publicationStatus.startsWith("Publish") ? "alert" : "status"}
                    className={styles.inlineAlert}
                  >
                    {publicationStatus}
                  </p>
                ) : null}
              </section>
            ) : story.state === "published" ? (
              <section className={styles.publishedTask} aria-labelledby="published-heading">
                <p className={styles.currentTaskLabel}>Published</p>
                <h2 id="published-heading">This Story is published</h2>
                <p>
                  Published is terminal. The Article, its revisions, and every durable record behind
                  them stay available.
                </p>
                <h3>Delivery</h3>
                {deliveryStanding.kind === "never-delivered" ? (
                  <p className={styles.deliveryRecord}>
                    This Story has never been delivered. Publishing records the decision to release
                    it; it does not send it anywhere.
                  </p>
                ) : deliveryStanding.kind === "in-flight" ? (
                  <p className={styles.deliveryRecord}>
                    A delivery to {deliveryStanding.delivery.destination} is in flight. It was
                    started at {readableTime(deliveryStanding.delivery.startedAt)}.
                  </p>
                ) : deliveryStanding.kind === "delivered" ? (
                  <div className={styles.deliveryRecord}>
                    <p>
                      Delivered to {deliveryStanding.delivery.destination} as{" "}
                      <strong>{deliveryStanding.delivery.remoteId}</strong>, completed at{" "}
                      {readableTime(
                        deliveryStanding.delivery.completedAt ??
                          deliveryStanding.delivery.startedAt,
                      )}
                      .
                    </p>
                    {deliveryStanding.delivery.outcome === "succeeded" &&
                    deliveryStanding.delivery.result.assignedSlug !== undefined ? (
                      <p className={styles.deliverySlugWarning}>
                        The destination changed the address: this Story asked for{" "}
                        <code>{deliveryStanding.delivery.result.requestedSlug}</code> and the post
                        is at <code>{deliveryStanding.delivery.result.assignedSlug}</code>.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className={styles.deliveryRecord}>
                    <p>
                      The last delivery to {deliveryStanding.delivery.destination} failed at{" "}
                      {readableTime(
                        deliveryStanding.delivery.completedAt ??
                          deliveryStanding.delivery.startedAt,
                      )}
                      .
                    </p>
                    <p>
                      {deliveryStanding.delivery.outcome === "failed"
                        ? deliveryFailureMessage(deliveryStanding.delivery.failure)
                        : null}
                    </p>
                  </div>
                )}
                {deliveryConfirming ? (
                  <div className={styles.taskActions}>
                    <p className={styles.formHint}>
                      This destination publishes live rather than as a draft, so the post is visible
                      to readers as soon as it arrives.
                    </p>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      disabled={deliveryPending}
                      onClick={() => void deliver()}
                    >
                      {deliveryPending ? "Delivering…" : "Publish it live now"}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      disabled={deliveryPending}
                      onClick={() => setDeliveryConfirming(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.primaryAction}
                    disabled={deliveryPending}
                    onClick={() => {
                      if (destinationPublishesLive) setDeliveryConfirming(true);
                      else void deliver();
                    }}
                  >
                    {deliveryPending
                      ? "Delivering…"
                      : deliveredPost
                        ? "Update the delivered post"
                        : "Deliver to the destination"}
                  </button>
                )}
                {deliveryStatus ? (
                  <p
                    role={deliveryStatus.startsWith("Delivered") ? "status" : "alert"}
                    className={styles.inlineAlert}
                  >
                    {deliveryStatus}
                  </p>
                ) : null}
              </section>
            ) : story.state === "in_review" && directorRunning ? (
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
                      <q className={styles.checkQuoted}>{check.quoted}</q>
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
                        {story.revisionCycle < 2 ? (
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
                        ) : null}
                      </div>
                      {story.revisionCycle >= 2 ? (
                        <p className={styles.inlineAlert}>
                          Both revision cycles have been used. Request changes is no longer
                          available for this Article revision.
                        </p>
                      ) : null}
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
                    {/* A disabled control should say what it is waiting for. */}
                    {!decisionPending &&
                    (!operatorDecision || decisionReason.trim().length === 0) ? (
                      <p className={styles.formHint}>
                        {!operatorDecision
                          ? "Choose Approve or Request changes, then give a reason."
                          : "A reason is required before the decision can be recorded."}
                      </p>
                    ) : null}
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
                {story.state === "changes_requested" && !revisionRunning ? (
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
            {proposalRunning ? (
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
                      disabled={proposalRunning}
                      onClick={() => void generateProposal()}
                    >
                      {proposalRunning ? "Assignment Editor is working…" : "Ask Assignment Editor"}
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
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    disabled={researchPending || researchRunning}
                    onClick={() => void findMoreSources()}
                  >
                    {researchRunning ? "Researcher is working…" : "Find more Sources"}
                  </button>
                </div>
                {/*
                 * The research option is inside the autopilot control because it is an option on
                 * starting autopilot and nothing else. Sitting loose on the page it read as
                 * "research this Story": an operator ticked it, stepped the Story by hand, and
                 * research was never asked to run.
                 */}
                <fieldset className={styles.autopilotControl}>
                  <legend>Autopilot</legend>
                  <label className={styles.autopilotOption}>
                    <input
                      type="checkbox"
                      checked={autopilotResearch}
                      disabled={autopilotPending || autopilotRunning}
                      onChange={(event) => setAutopilotResearch(event.target.checked)}
                    />
                    <span>
                      Research first, when autopilot runs
                      <small>
                        Retrieves up to {RESEARCH_CALL_BUDGET} linked pages and adds a model call
                        before drafting. Slower, and it costs more per run. It applies only to
                        autopilot — to research now, use Find more Sources.
                      </small>
                    </span>
                  </label>
                  <button
                    type="button"
                    className={styles.tertiaryAction}
                    disabled={autopilotPending || autopilotRunning}
                    onClick={() => void startAutopilot()}
                  >
                    {autopilotRunning ? "Autopilot is running…" : "Run autopilot"}
                  </button>
                </fieldset>
                <p className={styles.autopilotExplainer}>
                  Autopilot adopts the Director&apos;s recommendation as the decision and publishes
                  without a human reading the Article. Every record is still written as you, and
                  every reason says autopilot made the call.
                </p>
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
          draftRunning ? (
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

        {["intake", "assigned", "in_progress", "in_review", "changes_requested"].includes(
          story.state,
        ) ? (
          <section className={styles.rejectionPanel} aria-labelledby="story-rejection-heading">
            {!rejectionOpen ? (
              <div className={styles.rejectionSummary}>
                <div>
                  <h2 id="story-rejection-heading">Reject this Story</h2>
                  <p>End editorial work on this Story with an attributable operator reason.</p>
                </div>
                <button
                  type="button"
                  className={styles.secondaryAction}
                  disabled={editorialMutationPending}
                  onClick={() => setRejectionOpen(true)}
                >
                  Reject Story
                </button>
              </div>
            ) : (
              <form
                className={styles.rejectionForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  void rejectStory();
                }}
              >
                <div>
                  <h2 id="story-rejection-heading">Confirm Story rejection</h2>
                  <p>
                    Rejected is terminal. Existing Sources, assignments, Articles, agent runs, and
                    audit records will be preserved.
                  </p>
                </div>
                <label>
                  Rejection reason
                  <textarea
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    required
                    disabled={rejectionPending || editorialMutationPending}
                  />
                </label>
                <div className={styles.taskActions}>
                  <button
                    type="submit"
                    className={styles.dangerAction}
                    disabled={
                      rejectionPending ||
                      editorialMutationPending ||
                      rejectionReason.trim().length === 0
                    }
                  >
                    {rejectionPending ? "Rejecting Story…" : "Reject Story"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    disabled={rejectionPending}
                    onClick={() => {
                      setRejectionOpen(false);
                      setRejectionReason("");
                      setRejectionStatus(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {rejectionStatus ? (
                  <p role="alert" className={styles.inlineAlert}>
                    {rejectionStatus}
                  </p>
                ) : null}
              </form>
            )}
          </section>
        ) : null}
      </div>
    </article>
  );
}
