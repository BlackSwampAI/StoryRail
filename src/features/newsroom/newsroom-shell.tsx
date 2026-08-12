"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import type { StoryInspection } from "@/application/story-inspection";
import type { StoryListItem } from "@/application/story-listing";
import {
  STORY_STATES,
  type AgentProfile,
  type AgentRun,
  type Assignment,
  type EditorialActor,
  type SourceEvidencePreparation,
  type SourceExtraction,
  type StoryId,
  type StoryState,
  type StoryTransitionReceipt,
} from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import { AgentProfilesWorkspace } from "./agent-profiles-workspace";
import { agentProfileClient, type AgentProfileClient } from "./agent-profile-client";
import { STORY_STATE_LABELS } from "./newsroom-state";
import { SourceEvidenceWorkspace } from "./source-evidence-workspace";
import type { RequestSourceEvidenceUrl } from "./source-evidence-url-client";
import { SourceInboxWorkspace } from "./source-inbox-workspace";
import type { SourceInboxClient } from "./source-inbox-client";
import { storyClient, type StoryClient } from "./story-client";

type WorkspaceMode = "story" | "source-inbox" | "source-intake" | "agents";

export interface NewsroomShellProps {
  readonly requestSourceEvidence?: RequestSourceEvidenceUrl;
  readonly storyRequests?: StoryClient;
  readonly sourceInboxRequests?: SourceInboxClient;
  readonly agentProfileRequests?: AgentProfileClient;
}

function pluralizeStories(count: number): string {
  return `${count} ${count === 1 ? "story" : "stories"}`;
}

function pluralizeSources(count: number): string {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

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

function PersistedExtractionAttempt({
  extraction,
  attemptNumber,
}: Readonly<{ extraction: SourceExtraction; attemptNumber: number }>) {
  return (
    <article className={styles.persistedExtraction}>
      <header className={styles.extractionHeader}>
        <h5>Extraction attempt {attemptNumber}</h5>
        <span>{extraction.outcome === "succeeded" ? "Succeeded" : "Failed"}</span>
      </header>

      {extraction.outcome === "succeeded" ? (
        <>
          <dl className={styles.receiptFacts}>
            <div>
              <dt>Extracted document title</dt>
              <dd>{extraction.document.title ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Byline</dt>
              <dd>{extraction.document.byline ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Publication timestamp</dt>
              <dd>
                {extraction.document.publishedAt === null ? (
                  "Unavailable"
                ) : (
                  <time dateTime={extraction.document.publishedAt}>
                    {extraction.document.publishedAt}
                  </time>
                )}
              </dd>
            </div>
            <div>
              <dt>Language</dt>
              <dd>{extraction.document.language ?? "Unavailable"}</dd>
            </div>
          </dl>
          <h6>RAW EXTRACTION · actual persisted Markdown</h6>
          <pre className={styles.extractedContent}>{extraction.document.content}</pre>
        </>
      ) : (
        <div className={styles.extractionFailure}>
          <h6>Extraction failed</h6>
          <dl className={styles.receiptFacts}>
            <div>
              <dt>Failure code</dt>
              <dd>{extraction.failure.code}</dd>
            </div>
            <div>
              <dt>Retryable</dt>
              <dd>{extraction.failure.retryable ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </div>
      )}

      <details className={styles.extractionAudit}>
        <summary>Technical extraction record</summary>
        <dl className={styles.receiptFacts}>
          <div>
            <dt>Extraction ID</dt>
            <dd>{extraction.id}</dd>
          </div>
          <div>
            <dt>Extractor</dt>
            <dd>
              {extraction.extractor.key} / {extraction.extractor.version}
            </dd>
          </div>
          <div>
            <dt>Requested by</dt>
            <dd>{actorLabel(extraction.requestedBy)}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>
              <time dateTime={extraction.startedAt}>{extraction.startedAt}</time>
            </dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>
              <time dateTime={extraction.completedAt}>{extraction.completedAt}</time>
            </dd>
          </div>
        </dl>
      </details>
    </article>
  );
}

function PersistedPreparationAttempt({
  preparation,
  attemptNumber,
}: Readonly<{ preparation: SourceEvidencePreparation; attemptNumber: number }>) {
  return (
    <article className={styles.persistedExtraction}>
      <header className={styles.extractionHeader}>
        <h5>Prepared evidence attempt {attemptNumber}</h5>
        <span>{preparation.outcome === "succeeded" ? "Succeeded" : "Failed"}</span>
      </header>
      {preparation.outcome === "succeeded" ? (
        <>
          <dl className={styles.receiptFacts}>
            <div>
              <dt>Prepared title</dt>
              <dd>{preparation.document.title ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Byline</dt>
              <dd>{preparation.document.byline ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Publication timestamp</dt>
              <dd>{preparation.document.publishedAt ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Language</dt>
              <dd>{preparation.document.language ?? "Unavailable"}</dd>
            </div>
          </dl>
          <h6>Clean Markdown</h6>
          <pre className={styles.extractedContent}>{preparation.document.content}</pre>
        </>
      ) : (
        <div className={styles.extractionFailure}>
          <h6>Evidence preparation failed</h6>
          <p>
            {preparation.failure.code} · retryable: {preparation.failure.retryable ? "yes" : "no"}
          </p>
        </div>
      )}
      <details className={styles.extractionAudit}>
        <summary>Technical preparation record</summary>
        <dl className={styles.receiptFacts}>
          <div>
            <dt>Preparation ID</dt>
            <dd>{preparation.id}</dd>
          </div>
          <div>
            <dt>Source extraction ID</dt>
            <dd>{preparation.extractionId}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{preparation.model.provider}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{preparation.model.model}</dd>
          </div>
          <div>
            <dt>Preparer</dt>
            <dd>
              {preparation.preparer.key} / {preparation.preparer.version}
            </dd>
          </div>
          <div>
            <dt>Requested by</dt>
            <dd>{actorLabel(preparation.requestedBy)}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{preparation.startedAt}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{preparation.completedAt}</dd>
          </div>
          <div>
            <dt>Outcome</dt>
            <dd>{preparation.outcome}</dd>
          </div>
        </dl>
      </details>
    </article>
  );
}

function AssignmentEditorRuns({ runs }: Readonly<{ runs: readonly AgentRun[] }>) {
  const editorRuns = runs.filter(
    (run): run is Extract<AgentRun, { readonly role: "assignment_editor" }> =>
      run.role === "assignment_editor",
  );
  return (
    <details className={styles.technicalDetails}>
      <summary>Assignment Editor runs</summary>
      {editorRuns.length === 0 ? (
        <p>No Assignment Editor runs are recorded.</p>
      ) : (
        editorRuns.map((run) => (
          <article key={run.id} className={styles.persistedExtraction}>
            <h4>{run.outcome === "succeeded" ? "Suggestion succeeded" : "Suggestion failed"}</h4>
            <dl className={styles.receiptFacts}>
              <div>
                <dt>Outcome</dt>
                <dd>{run.outcome}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>
                  {run.model.provider} / {run.model.model}
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
            </dl>
            <details>
              <summary>Technical AgentRun record</summary>
              <p>Run ID: {run.id}</p>
              <p>Profile ID: {run.profileId}</p>
              <p>
                Prompt: {run.prompt.key} / {run.prompt.version}
              </p>
              <p>
                Evidence references:{" "}
                {run.input.evidence.length === 0
                  ? "None"
                  : run.input.evidence
                      .map(
                        (reference) =>
                          `${reference.sourceId}: ${reference.relevance}; ${reference.evidenceKind} ${reference.evidenceId}`,
                      )
                      .join(", ")}
              </p>
              <p>
                Unavailable Source IDs:{" "}
                {run.input.unavailableSourceIds.length === 0
                  ? "None"
                  : run.input.unavailableSourceIds.join(", ")}
              </p>
            </details>
          </article>
        ))
      )}
    </details>
  );
}

function WriterRuns({ runs }: Readonly<{ runs: readonly AgentRun[] }>) {
  const writerRuns = runs.filter(
    (run): run is Extract<AgentRun, { readonly role: "writer" }> => run.role === "writer",
  );
  return (
    <details className={styles.technicalDetails}>
      <summary>Writer runs</summary>
      {writerRuns.length === 0 ? (
        <p>No Writer runs are recorded.</p>
      ) : (
        writerRuns.map((run) => (
          <article key={run.id} className={styles.persistedExtraction}>
            <h4>Article draft · {run.outcome}</h4>
            <dl className={styles.receiptFacts}>
              <div>
                <dt>Operation</dt>
                <dd>{run.operation}</dd>
              </div>
              <div>
                <dt>Writer Profile</dt>
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
                <dt>Run ID</dt>
                <dd>{run.id}</dd>
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
            </dl>
            <p>
              Evidence:{" "}
              {run.input.evidence
                .map(
                  ({ sourceId, evidenceKind, evidenceId }) =>
                    `${sourceId} (${evidenceKind}: ${evidenceId})`,
                )
                .join(", ")}
            </p>
            <p>
              Unavailable Source IDs:{" "}
              {run.input.unavailableSourceIds.length === 0
                ? "None"
                : run.input.unavailableSourceIds.join(", ")}
            </p>
          </article>
        ))
      )}
    </details>
  );
}

function PersistedStoryWorkspace({
  inspection,
  notice,
  requests,
  profileRequests,
  onAssigned,
  onWriterCompleted,
}: Readonly<{
  inspection: StoryInspection;
  notice?: string;
  requests: StoryClient;
  profileRequests: AgentProfileClient;
  onAssigned: (
    facts: {
      readonly assignment: Assignment;
      readonly story: StoryInspection["story"];
      readonly transitionReceipt: StoryTransitionReceipt;
    },
    writerProfile: AgentProfile,
  ) => Promise<void>;
  onWriterCompleted: (inspection: StoryInspection) => void;
}>) {
  const { story, sources, assignment, transitions, agentRuns, article } = inspection;
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
  const latestDurableRun = agentRuns.at(-1);
  const [profiles, setProfiles] = useState<readonly AgentProfile[]>([]);
  const [profilesUnavailable, setProfilesUnavailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [writerProfileId, setWriterProfileId] = useState(
    durableProposal?.proposal.writerProfileId ?? "",
  );
  const [angle, setAngle] = useState(durableProposal?.proposal.angle ?? "");
  const [brief, setBrief] = useState(durableProposal?.proposal.brief ?? "");
  const [constraints, setConstraints] = useState(durableProposal?.proposal.constraints ?? "");
  const [reason, setReason] = useState(durableProposal?.proposal.reason ?? "");
  const [runs, setRuns] = useState<readonly AgentRun[]>(agentRuns);
  const [proposalPending, setProposalPending] = useState(false);
  const [writerPending, setWriterPending] = useState(false);
  const [writerStatus, setWriterStatus] = useState<string | null>(null);
  const [proposalStatus, setProposalStatus] = useState<string | null>(
    latestDurableRun?.outcome === "failed"
      ? `Assignment Editor failed: ${latestDurableRun.failure.code}. Retryable: ${latestDurableRun.failure.retryable ? "yes" : "no"}.`
      : latestDurableRun?.outcome === "succeeded"
        ? "Assignment Editor suggestion ready. Review or edit it before creating the Assignment."
        : null,
  );

  useEffect(() => {
    if (story.state !== "intake" || assignment !== null) return;
    let active = true;
    void profileRequests
      .listProfiles()
      .then((result) => {
        if (!active) return;
        if (result.kind !== "completed") {
          setProfilesUnavailable(true);
          return;
        }
        const writers = result.value.filter((profile) => profile.role === "writer");
        setProfiles(writers);
        setWriterProfileId((current) => current || writers[0]?.id || "");
      })
      .catch(() => {
        if (active) setProfilesUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [assignment, profileRequests, story.id, story.state]);

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setSubmissionError(null);
    try {
      const result = await requests.assignStory(story.id, {
        writerProfileId,
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
      const writer = profiles.find((profile) => profile.id === writerProfileId);
      if (!writer) {
        setSubmissionError("The selected Writer Profile is no longer available.");
        return;
      }
      await onAssigned(result.value, writer);
    } finally {
      setPending(false);
    }
  }

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
      const proposal = result.value.proposal;
      setWriterProfileId(proposal.writerProfileId);
      setAngle(proposal.angle);
      setBrief(proposal.brief);
      setConstraints(proposal.constraints ?? "");
      setReason(proposal.reason);
      setProposalStatus(
        "Assignment Editor suggestion ready. Review or edit it before creating the Assignment.",
      );
    } catch {
      setProposalStatus("The Assignment Editor request could not be completed.");
    } finally {
      setProposalPending(false);
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
  const latestSuccessfulRun = [...runs]
    .reverse()
    .find(
      (
        run,
      ): run is Extract<
        AgentRun,
        { readonly role: "assignment_editor"; readonly outcome: "succeeded" }
      > => run.role === "assignment_editor" && run.outcome === "succeeded",
    );
  const currentSourceIds = new Set(sources.map(({ source }) => source.id));
  const proposalSourceIds = new Set(
    latestSuccessfulRun === undefined
      ? []
      : [
          ...latestSuccessfulRun.input.evidence.map(({ sourceId }) => sourceId),
          ...latestSuccessfulRun.input.unavailableSourceIds,
        ],
  );
  const evidenceChanged =
    latestSuccessfulRun !== undefined &&
    (currentSourceIds.size !== proposalSourceIds.size ||
      [...currentSourceIds].some((sourceId) => !proposalSourceIds.has(sourceId)));
  return (
    <article className={styles.storyWorkspace} aria-labelledby="workspace-story-title">
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.sectionKicker}>Persisted Story</p>
          <h2 id="workspace-story-title">{story.title}</h2>
        </div>
        <span className={styles.stateBadge}>{STORY_STATE_LABELS[story.state]}</span>
      </header>

      <dl className={styles.storyFacts}>
        <div>
          <dt>Revision cycle</dt>
          <dd>{story.revisionCycle}</dd>
        </div>
        <div>
          <dt>Attached Sources</dt>
          <dd>{sources.length}</dd>
        </div>
      </dl>
      {notice ? (
        <p role="status" className={styles.auditFact}>
          {notice}
        </p>
      ) : null}
      <details className={styles.technicalDetails}>
        <summary>Technical Story details</summary>
        <dl className={styles.receiptFacts}>
          <div>
            <dt>Story ID</dt>
            <dd>{story.id}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              <time dateTime={story.createdAt}>{story.createdAt}</time>
            </dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>
              <time dateTime={story.updatedAt}>{story.updatedAt}</time>
            </dd>
          </div>
        </dl>
      </details>

      <div className={styles.persistedSources}>
        <p className={styles.sectionNumber}>01</p>
        <h3>Attached Sources</h3>
        {sources.map(({ attachment, source, extractions, preparations }) => {
          const canonicalHref = safeUrl(source.canonicalUrl);
          const latestExtraction = extractions.at(-1);
          return (
            <section className={styles.persistedSource} key={`${story.id}:${source.id}`}>
              <h4>
                {canonicalHref === null ? (
                  source.canonicalUrl
                ) : (
                  <a href={canonicalHref} target="_blank" rel="noreferrer">
                    {source.canonicalUrl}
                  </a>
                )}
              </h4>
              <dl className={`${styles.receiptFacts} ${styles.primarySourceFacts}`}>
                <div>
                  <dt>Relevance</dt>
                  <dd>{attachment.relevance}</dd>
                </div>
              </dl>
              <details className={styles.technicalDetails}>
                <summary>Technical source details</summary>
                <dl className={styles.receiptFacts}>
                  <div>
                    <dt>Submitted URL</dt>
                    <dd>{source.submittedUrl}</dd>
                  </div>
                  <div>
                    <dt>Source provenance</dt>
                    <dd>{actorLabel(source.submittedBy)}</dd>
                  </div>
                  <div>
                    <dt>Source received</dt>
                    <dd>
                      <time dateTime={source.receivedAt}>{source.receivedAt}</time>
                    </dd>
                  </div>
                  <div>
                    <dt>Attachment provenance</dt>
                    <dd>{actorLabel(attachment.attachedBy)}</dd>
                  </div>
                  <div>
                    <dt>Attached</dt>
                    <dd>
                      <time dateTime={attachment.attachedAt}>{attachment.attachedAt}</time>
                    </dd>
                  </div>
                  <div>
                    <dt>Source ID</dt>
                    <dd>{source.id}</dd>
                  </div>
                </dl>
              </details>
              <div className={styles.persistedEvidence}>
                <h5>Prepared evidence</h5>
                {preparations.length === 0 ? (
                  <p className={styles.noExtraction}>
                    No prepared evidence is recorded for this Source.
                  </p>
                ) : (
                  preparations.map((preparation, index) => (
                    <PersistedPreparationAttempt
                      preparation={preparation}
                      attemptNumber={index + 1}
                      key={preparation.id}
                    />
                  ))
                )}
                <details className={styles.rawExtractionHistory}>
                  <summary>
                    <span className={styles.disclosureLabel}>
                      <span className={styles.disclosureChevron} aria-hidden="true">
                        ▸
                      </span>
                      Raw extraction history
                    </span>
                    <span>
                      {extractions.length} {extractions.length === 1 ? "attempt" : "attempts"}
                      {latestExtraction === undefined
                        ? ""
                        : ` · latest ${latestExtraction.outcome}`}
                    </span>
                  </summary>
                  {extractions.length === 0 ? (
                    <p className={styles.noExtraction}>
                      No extraction is recorded for this Source.
                    </p>
                  ) : (
                    extractions.map((extraction, index) => (
                      <PersistedExtractionAttempt
                        extraction={extraction}
                        attemptNumber={index + 1}
                        key={extraction.id}
                      />
                    ))
                  )}
                </details>
              </div>
            </section>
          );
        })}
      </div>

      <div className={styles.workspaceSections}>
        <section aria-labelledby="assignment-heading">
          <p className={styles.sectionNumber}>02</p>
          <h3 id="assignment-heading">Assignment</h3>
          {assignment === null && story.state === "intake" ? (
            <div>
              <div className={styles.auditFact}>
                <button
                  type="button"
                  onClick={() => void generateProposal()}
                  disabled={proposalPending}
                >
                  {proposalPending ? "Assignment Editor is working…" : "Ask Assignment Editor"}
                </button>
                <p>
                  Generates a suggestion only. Review or edit it before creating the Assignment.
                </p>
                {proposalStatus ? <p role="status">{proposalStatus}</p> : null}
                {evidenceChanged ? (
                  <p role="alert">
                    Story evidence has changed since this suggestion was generated. Regenerate the
                    Assignment Editor suggestion before relying on it.
                  </p>
                ) : null}
              </div>
              <form
                className={styles.storyCreationForm}
                onSubmit={(event) => void submitAssignment(event)}
              >
                <p>Assignment will snapshot all currently attached Sources: {sources.length}</p>
                <label>
                  Writer
                  <select
                    value={writerProfileId}
                    onChange={(event) => setWriterProfileId(event.target.value)}
                    disabled={pending || profilesUnavailable}
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
                    disabled={pending}
                    required
                  />
                </label>
                <label>
                  Brief
                  <textarea
                    value={brief}
                    onChange={(event) => setBrief(event.target.value)}
                    disabled={pending}
                    required
                  />
                </label>
                <label>
                  Constraints (optional)
                  <textarea
                    value={constraints}
                    onChange={(event) => setConstraints(event.target.value)}
                    disabled={pending}
                  />
                </label>
                <label>
                  Assignment reason
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={pending}
                    required
                  />
                </label>
                <button type="submit" disabled={pending || writerProfileId.length === 0}>
                  {pending ? "Assigning…" : "Create Assignment"}
                </button>
                {profilesUnavailable ? <p role="alert">Writer Profiles are unavailable.</p> : null}
                {submissionError ? <p role="alert">{submissionError}</p> : null}
              </form>
            </div>
          ) : assignment !== null ? (
            <div>
              <dl className={styles.receiptFacts}>
                <div>
                  <dt>Writer</dt>
                  <dd>{assignment.writerProfile.name}</dd>
                </div>
                <div>
                  <dt>Profile</dt>
                  <dd>{assignment.writerProfile.builtIn ? "Built in" : "Custom"}</dd>
                </div>
                <div>
                  <dt>Provider / model</dt>
                  <dd>
                    {assignment.writerProfile.model === null
                      ? "Not configured"
                      : `${assignment.writerProfile.model.provider} / ${assignment.writerProfile.model.model}`}
                  </dd>
                </div>
                <div>
                  <dt>Angle</dt>
                  <dd>{assignment.assignment.angle}</dd>
                </div>
                <div>
                  <dt>Brief</dt>
                  <dd>{assignment.assignment.brief}</dd>
                </div>
                <div>
                  <dt>Constraints</dt>
                  <dd>{assignment.assignment.constraints ?? "None"}</dd>
                </div>
                <div>
                  <dt>Evidence Sources</dt>
                  <dd>{assignment.assignment.sourceIds.length}</dd>
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
              <details>
                <summary>Technical Assignment record</summary>
                <p>Assignment ID: {assignment.assignment.id}</p>
                <p>Writer Profile ID: {assignment.assignment.writerProfileId}</p>
                <p>
                  Source IDs:{" "}
                  {assignment.assignment.sourceIds.length === 0
                    ? "None"
                    : assignment.assignment.sourceIds.join(", ")}
                </p>
              </details>
            </div>
          ) : (
            <p>No durable Assignment is recorded for this Story.</p>
          )}
          <AssignmentEditorRuns runs={runs} />
          {story.state === "assigned" && assignment !== null && article === null ? (
            <div className={styles.auditFact}>
              <button type="button" disabled={writerPending} onClick={() => void runWriter()}>
                {writerPending ? "Writer is working…" : "Run Writer"}
              </button>
              <p>
                The assigned Writer will create the first Article draft from the durable Assignment
                and evidence.
              </p>
              {writerStatus ? (
                <p role={writerStatus.startsWith("Writer failed") ? "alert" : "status"}>
                  {writerStatus}
                </p>
              ) : null}
            </div>
          ) : null}
          <WriterRuns runs={runs} />
        </section>
        <section aria-labelledby="article-heading">
          <p className={styles.sectionNumber}>03</p>
          <h3 id="article-heading">Article</h3>
          {article === null ? (
            <p>No durable Article is recorded for this Story.</p>
          ) : (
            article.revisions.map((revision) => (
              <article key={revision.id}>
                <h4>{revision.headline}</h4>
                {revision.dek ? <p>{revision.dek}</p> : null}
                <pre className={styles.extractedContent}>{revision.bodyMarkdown}</pre>
                <dl className={styles.receiptFacts}>
                  <div>
                    <dt>Revision</dt>
                    <dd>{revision.revisionNumber}</dd>
                  </div>
                  <div>
                    <dt>Writer Profile</dt>
                    <dd>{revision.writerProfileId}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{revision.createdAt}</dd>
                  </div>
                  <div>
                    <dt>AgentRun</dt>
                    <dd>{revision.agentRunId}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </section>
        <section aria-labelledby="activity-heading">
          <p className={styles.sectionNumber}>04</p>
          <h3 id="activity-heading">Activity</h3>
          {transitions.length === 0 ? (
            <p>No durable Story transitions are recorded.</p>
          ) : (
            transitions.map((transition) => (
              <article key={transition.transitionId}>
                <h4>
                  {STORY_STATE_LABELS[transition.previousState]} →{" "}
                  {STORY_STATE_LABELS[transition.nextState]}
                </h4>
                <dl className={styles.receiptFacts}>
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
                <details>
                  <summary>Technical transition record</summary>
                  <p>Transition ID: {transition.transitionId}</p>
                </details>
              </article>
            ))
          )}
        </section>
      </div>
    </article>
  );
}

type StoryListingState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly items: readonly StoryListItem[] }
  | { readonly kind: "unavailable" };

type StorySelection =
  | { readonly kind: "none" }
  | { readonly kind: "loading"; readonly storyId: StoryId }
  | { readonly kind: "loaded"; readonly inspection: StoryInspection; readonly notice?: string }
  | { readonly kind: "unavailable"; readonly storyId: StoryId };

export function NewsroomShell({
  requestSourceEvidence,
  storyRequests,
  sourceInboxRequests,
  agentProfileRequests,
}: NewsroomShellProps) {
  const requests = storyRequests ?? storyClient;
  const [selectedQueue, setSelectedQueue] = useState<StoryState>("intake");
  const [listing, setListing] = useState<StoryListingState>({ kind: "loading" });
  const [storySelection, setStorySelection] = useState<StorySelection>({ kind: "none" });
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("story");
  const [sourceInboxRefreshVersion, setSourceInboxRefreshVersion] = useState(0);

  const loadStories = useCallback(async () => {
    setListing({ kind: "loading" });
    try {
      const result = await requests.listStories();
      setListing(
        result.kind === "completed"
          ? { kind: "loaded", items: result.value }
          : { kind: "unavailable" },
      );
    } catch {
      setListing({ kind: "unavailable" });
    }
  }, [requests]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await requests.listStories();
        if (active) {
          setListing(
            result.kind === "completed"
              ? { kind: "loaded", items: result.value }
              : { kind: "unavailable" },
          );
        }
      } catch {
        if (active) setListing({ kind: "unavailable" });
      }
    })();
    return () => {
      active = false;
    };
  }, [requests]);

  const items = listing.kind === "loaded" ? listing.items : [];
  const visibleStories = items.filter(({ story }) => story.state === selectedQueue);

  function selectQueue(state: StoryState) {
    setSelectedQueue(state);
    setStorySelection({ kind: "none" });
  }

  async function selectStory(identity: StoryId) {
    setStorySelection({ kind: "loading", storyId: identity });
    setWorkspaceMode("story");
    try {
      const result = await requests.inspectStory(identity);
      setStorySelection(
        result.kind === "completed"
          ? { kind: "loaded", inspection: result.value }
          : { kind: "unavailable", storyId: identity },
      );
    } catch {
      setStorySelection({ kind: "unavailable", storyId: identity });
    }
  }

  function upsertStoryListItem(item: StoryListItem) {
    setListing((current) => {
      if (current.kind !== "loaded") return current;
      const existingIndex = current.items.findIndex(({ story }) => story.id === item.story.id);
      const nextItems = [...current.items];
      if (existingIndex === -1) nextItems.push(item);
      else nextItems[existingIndex] = item;
      nextItems.sort((left, right) =>
        left.story.id < right.story.id ? -1 : left.story.id > right.story.id ? 1 : 0,
      );
      return { kind: "loaded", items: nextItems };
    });
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.desk} aria-label="Newsroom desk">
        <header className={styles.identity}>
          <p className={styles.eyebrow}>Editorial control plane</p>
          <p className={styles.wordmark}>StoryRail</p>
          <p className={styles.deskDescription}>
            A compact view of the Stories moving through the editorial desk.
          </p>
        </header>

        <nav className={styles.queueNavigation} aria-label="Story state queues">
          <p className={styles.navigationLabel}>Persisted Story queues</p>
          <div className={styles.queueList}>
            {STORY_STATES.map((state) => {
              const count = items.filter(({ story }) => story.state === state).length;
              const label = STORY_STATE_LABELS[state];
              return (
                <button
                  className={styles.queueButton}
                  type="button"
                  key={state}
                  aria-current={selectedQueue === state ? "page" : undefined}
                  aria-label={
                    listing.kind === "loaded"
                      ? `${label}, ${pluralizeStories(count)}`
                      : `${label}, count unavailable`
                  }
                  onClick={() => selectQueue(state)}
                >
                  <span>{label}</span>
                  <span className={styles.queueCount}>
                    {listing.kind === "loaded" ? count : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <section className={styles.storyListSection} aria-labelledby="queue-stories-title">
          <div className={styles.storyListHeader}>
            <div>
              <p className={styles.navigationLabel}>On the desk</p>
              <h1 id="queue-stories-title">{STORY_STATE_LABELS[selectedQueue]} Stories</h1>
            </div>
            <span>{listing.kind === "loaded" ? visibleStories.length : "—"}</span>
          </div>

          {listing.kind === "loading" ? (
            <div className={styles.emptyQueue} role="status" aria-live="polite">
              <p>Loading persisted Stories…</p>
              <span>Queue counts are not yet known.</span>
            </div>
          ) : listing.kind === "unavailable" ? (
            <div className={styles.emptyQueue} role="alert">
              <p>Persisted Stories are unavailable.</p>
              <span>The newsroom could not load its authoritative Story list.</span>
              <button
                className={styles.storyCreationAction}
                type="button"
                onClick={() => void loadStories()}
              >
                Retry
              </button>
            </div>
          ) : visibleStories.length > 0 ? (
            <div className={styles.storyList}>
              {visibleStories.map(({ story, sourceCount }) => (
                <button
                  className={styles.storyCard}
                  type="button"
                  key={story.id}
                  aria-pressed={
                    storySelection.kind === "loaded" &&
                    storySelection.inspection.story.id === story.id
                  }
                  onClick={() => void selectStory(story.id)}
                >
                  <span className={styles.storyCardTitle}>{story.title}</span>
                  <span className={styles.storyCardMeta}>{pluralizeSources(sourceCount)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.emptyQueue} role="status">
              <p>No Stories in {STORY_STATE_LABELS[selectedQueue].toLowerCase()}.</p>
              <span>This queue is clear.</span>
            </div>
          )}
        </section>
      </aside>

      <main className={styles.workspace}>
        <header className={styles.workspaceNavigation}>
          <p>Workspace</p>
          <div className={styles.workspaceSwitch} role="group" aria-label="Workspace view">
            <button
              type="button"
              aria-pressed={workspaceMode === "story"}
              onClick={() => setWorkspaceMode("story")}
            >
              Story
            </button>
            <button
              type="button"
              aria-pressed={workspaceMode === "source-inbox"}
              onClick={() => setWorkspaceMode("source-inbox")}
            >
              Source inbox
            </button>
            <button
              type="button"
              aria-pressed={workspaceMode === "source-intake"}
              onClick={() => setWorkspaceMode("source-intake")}
            >
              Source intake
            </button>
            <button
              type="button"
              aria-pressed={workspaceMode === "agents"}
              onClick={() => setWorkspaceMode("agents")}
            >
              Agents
            </button>
          </div>
        </header>

        <div hidden={workspaceMode !== "story"}>
          {storySelection.kind === "loaded" ? (
            <PersistedStoryWorkspace
              key={storySelection.inspection.story.id}
              inspection={storySelection.inspection}
              notice={storySelection.notice}
              requests={requests}
              profileRequests={agentProfileRequests ?? agentProfileClient}
              onAssigned={async (facts, writerProfile) => {
                const returnedInspection: StoryInspection = {
                  ...storySelection.inspection,
                  story: facts.story,
                  assignment: { assignment: facts.assignment, writerProfile },
                  transitions: [...storySelection.inspection.transitions, facts.transitionReceipt],
                };
                upsertStoryListItem({
                  story: facts.story,
                  sourceCount: storySelection.inspection.sources.length,
                });
                setSelectedQueue("assigned");
                setStorySelection({ kind: "loaded", inspection: returnedInspection });
                try {
                  const refreshed = await requests.inspectStory(facts.story.id);
                  if (refreshed.kind === "completed")
                    setStorySelection({ kind: "loaded", inspection: refreshed.value });
                  else
                    setStorySelection({
                      kind: "loaded",
                      inspection: returnedInspection,
                      notice:
                        "Assignment saved. Authoritative inspection refresh is unavailable; retry by reopening this Story.",
                    });
                } catch {
                  setStorySelection({
                    kind: "loaded",
                    inspection: returnedInspection,
                    notice:
                      "Assignment saved. Authoritative inspection refresh is unavailable; retry by reopening this Story.",
                  });
                }
              }}
              onWriterCompleted={(refreshed) => {
                upsertStoryListItem({
                  story: refreshed.story,
                  sourceCount: refreshed.sources.length,
                });
                setSelectedQueue("in_progress");
                setStorySelection({ kind: "loaded", inspection: refreshed });
              }}
            />
          ) : storySelection.kind === "loading" ? (
            <section className={styles.emptyWorkspace} role="status">
              <p className={styles.sectionKicker}>Story workspace</p>
              <h2>Loading authoritative Story…</h2>
            </section>
          ) : storySelection.kind === "unavailable" ? (
            <section className={styles.emptyWorkspace} role="alert">
              <p className={styles.sectionKicker}>Story workspace</p>
              <h2>Story inspection unavailable</h2>
              <p>The authoritative Story inspection could not be loaded.</p>
              <button
                className={styles.storyCreationAction}
                type="button"
                onClick={() => void selectStory(storySelection.storyId)}
              >
                Retry inspection
              </button>
            </section>
          ) : (
            <section className={styles.emptyWorkspace} aria-labelledby="empty-workspace-title">
              <p className={styles.sectionKicker}>Story workspace</p>
              <h2 id="empty-workspace-title">No Story selected</h2>
              <p>Choose a persisted Story card to load its authoritative inspection.</p>
            </section>
          )}
        </div>
        <div hidden={workspaceMode !== "source-inbox"}>
          <SourceInboxWorkspace
            refreshVersion={sourceInboxRefreshVersion}
            stories={items}
            inboxRequests={sourceInboxRequests}
            storyRequests={requests}
            onStoryKnown={(story, sourceCount) => {
              upsertStoryListItem({ story, sourceCount });
              setSelectedQueue(story.state);
            }}
            onStoryLoaded={(inspection) => {
              upsertStoryListItem({
                story: inspection.story,
                sourceCount: inspection.sources.length,
              });
              setSelectedQueue(inspection.story.state);
              setStorySelection({ kind: "loaded", inspection });
              setWorkspaceMode("story");
            }}
          />
        </div>
        <div hidden={workspaceMode !== "source-intake"}>
          <SourceEvidenceWorkspace
            requestSourceEvidence={requestSourceEvidence}
            onSourceAvailable={() => setSourceInboxRefreshVersion((current) => current + 1)}
          />
        </div>
        <div hidden={workspaceMode !== "agents"}>
          {workspaceMode === "agents" ? (
            <AgentProfilesWorkspace requests={agentProfileRequests} />
          ) : null}
        </div>
      </main>
    </div>
  );
}
