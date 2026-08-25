"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";

import type {
  EditorialActor,
  SourceEvidencePreparation,
  SourceExtraction,
  UrlSource,
} from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import { useNewsroomClients } from "./newsroom-clients";
import { SafeMarkdown } from "./safe-markdown";
import {
  SOURCE_INBOX_UNAVAILABLE_MESSAGE,
  type SourceInboxClient,
  type SourceInboxClientError,
} from "./source-inbox-client";
import {
  SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE,
  type RequestSourceEvidenceUrl,
  type SourceEvidenceApplicationError,
  type SourceEvidenceUrlResult,
} from "./source-evidence-url-client";

export interface SourceEvidenceWorkspaceProps {
  readonly requestSourceEvidence?: RequestSourceEvidenceUrl;
  readonly inboxRequests?: SourceInboxClient;
  readonly onSourceAvailable?: (sourceId: string) => void;
  readonly onReviewInInbox?: (sourceId: string) => void;
}

type PreparationRequestFailure =
  | { readonly kind: "application-failure"; readonly error: SourceInboxClientError }
  | { readonly kind: "unavailable"; readonly message: string };

type IntakeState =
  | { readonly kind: "idle" }
  | { readonly kind: "preserving" }
  | { readonly kind: "extracting"; readonly source: UrlSource }
  | {
      readonly kind: "extraction-retry-failed";
      readonly source: UrlSource;
      readonly failure: PreparationRequestFailure;
    }
  | {
      readonly kind: "preparing";
      readonly source: UrlSource;
      readonly extraction: Extract<SourceExtraction, { readonly outcome: "succeeded" }>;
      readonly preparations: readonly SourceEvidencePreparation[];
    }
  | {
      readonly kind: "review";
      readonly source: UrlSource;
      readonly extraction: Extract<SourceExtraction, { readonly outcome: "succeeded" }>;
      readonly preparations: readonly SourceEvidencePreparation[];
      readonly requestFailure: PreparationRequestFailure | null;
    }
  | { readonly kind: "result"; readonly result: SourceEvidenceUrlResult };

function ActorValue({ actor }: Readonly<{ actor: EditorialActor }>) {
  return actor.type === "operator" ? (
    <>
      operator: <span>{actor.operatorId}</span>
    </>
  ) : (
    <>
      agent: <span>{actor.role}</span>, run <span>{actor.runId}</span>
    </>
  );
}

function Fact({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SourceFacts({ source }: Readonly<{ source: UrlSource }>) {
  return (
    <section className={styles.receiptSection}>
      <h3>Preserved Source</h3>
      <dl className={styles.receiptFacts}>
        <Fact label="Source ID">{source.id}</Fact>
        <Fact label="Type">{source.type}</Fact>
        <Fact label="Exact submitted URL">{source.submittedUrl}</Fact>
        <Fact label="Canonical URL">{source.canonicalUrl}</Fact>
        <Fact label="Submitting actor">
          <ActorValue actor={source.submittedBy} />
        </Fact>
        <Fact label="Received timestamp">
          <time dateTime={source.receivedAt}>{source.receivedAt}</time>
        </Fact>
      </dl>
    </section>
  );
}

function ExtractionFacts({ extraction }: Readonly<{ extraction: SourceExtraction }>) {
  return (
    <section className={styles.receiptSection}>
      <h3>Extraction record</h3>
      <dl className={styles.receiptFacts}>
        <Fact label="Extraction ID">{extraction.id}</Fact>
        <Fact label="Source ID">{extraction.sourceId}</Fact>
        <Fact label="Extractor">
          {extraction.extractor.key} / {extraction.extractor.version}
        </Fact>
        <Fact label="Requesting actor">
          <ActorValue actor={extraction.requestedBy} />
        </Fact>
        <Fact label="Started">{extraction.startedAt}</Fact>
        <Fact label="Completed">{extraction.completedAt}</Fact>
        <Fact label="Outcome">{extraction.outcome}</Fact>
        {extraction.outcome === "failed" ? (
          <>
            <Fact label="Failure code">{extraction.failure.code}</Fact>
            <Fact label="Retryable">{extraction.failure.retryable ? "Yes" : "No"}</Fact>
          </>
        ) : null}
      </dl>
      {extraction.outcome === "succeeded" ? (
        <>
          <h4>Exact raw extracted Markdown</h4>
          <pre className={styles.extractedContent}>{extraction.document.content}</pre>
        </>
      ) : null}
    </section>
  );
}

function PreparationAudit({ preparation }: Readonly<{ preparation: SourceEvidencePreparation }>) {
  return (
    <article className={styles.auditRecord}>
      <h5>{preparation.outcome === "succeeded" ? "Succeeded" : "Failed"}</h5>
      <dl className={styles.receiptFacts}>
        <Fact label="Preparation ID">{preparation.id}</Fact>
        <Fact label="Extraction ID">{preparation.extractionId}</Fact>
        <Fact label="Model">
          {preparation.model.provider} / {preparation.model.model}
        </Fact>
        <Fact label="Preparer">
          {preparation.preparer.key} / {preparation.preparer.version}
        </Fact>
        <Fact label="Requested by">
          <ActorValue actor={preparation.requestedBy} />
        </Fact>
        <Fact label="Started">{preparation.startedAt}</Fact>
        <Fact label="Completed">{preparation.completedAt}</Fact>
        <Fact label="Outcome">{preparation.outcome}</Fact>
        {preparation.outcome === "failed" ? (
          <>
            <Fact label="Failure code">{preparation.failure.code}</Fact>
            <Fact label="Retryable">{preparation.failure.retryable ? "Yes" : "No"}</Fact>
          </>
        ) : null}
      </dl>
      {preparation.outcome === "succeeded" ? (
        <>
          <h5>Exact prepared Markdown</h5>
          <pre className={styles.extractedContent}>{preparation.document.content}</pre>
        </>
      ) : null}
    </article>
  );
}

function ErrorFacts({ error }: Readonly<{ error: SourceEvidenceApplicationError }>) {
  return (
    <dl className={styles.receiptFacts}>
      <Fact label="Error code">{error.code}</Fact>
      <Fact label="Message">{error.message}</Fact>
    </dl>
  );
}

function BasicResult({ result }: Readonly<{ result: SourceEvidenceUrlResult }>) {
  if (result.kind === "completed") {
    const failed = result.extraction.outcome === "failed";
    return (
      <article className={`${styles.receipt} ${styles.receiptPartial}`} role="alert">
        <p className={styles.sectionKicker}>Source preserved</p>
        <h2>{failed ? "Extraction failed" : "Source extraction completed"}</h2>
        <ul className={styles.completionChecklist}>
          <li data-stage="completed">Source preserved</li>
          <li data-stage={failed ? "failed" : "completed"}>
            {failed ? "Extraction failed" : "Article extracted"}
          </li>
          <li data-stage={failed ? "skipped" : "active"}>
            {failed ? "Evidence preparation not attempted" : "Evidence preparation pending"}
          </li>
        </ul>
        {result.extraction.outcome === "failed" ? (
          <div className={styles.extractionFailure} role="alert">
            <h3>Extraction failure recorded</h3>
            <p>
              {result.extraction.failure.code} · retryable:{" "}
              {result.extraction.failure.retryable ? "yes" : "no"}
            </p>
          </div>
        ) : null}
        <details className={styles.secondaryPanel}>
          <summary>
            <span>
              <strong>Technical details</strong>
              <small>Source and raw extraction records</small>
            </span>
          </summary>
          <div className={styles.secondaryPanelContent}>
            <SourceFacts source={result.source} />
            <ExtractionFacts extraction={result.extraction} />
          </div>
        </details>
      </article>
    );
  }

  if (result.kind === "partial-completion")
    return (
      <article className={`${styles.receipt} ${styles.receiptPartial}`} role="alert">
        <p className={styles.sectionKicker}>Source preserved</p>
        <h2>Extraction could not complete</h2>
        <ul className={styles.completionChecklist}>
          <li data-stage="completed">Source preserved</li>
          <li data-stage="failed">Extraction application failure</li>
          <li data-stage="skipped">Evidence preparation not attempted</li>
        </ul>
        <ErrorFacts error={result.error} />
        <details className={styles.secondaryPanel}>
          <summary>
            <span>
              <strong>Technical details</strong>
              <small>Preserved Source record</small>
            </span>
          </summary>
          <div className={styles.secondaryPanelContent}>
            <SourceFacts source={result.source} />
          </div>
        </details>
      </article>
    );

  if (result.kind === "preservation-conflict")
    return (
      <article
        className={`${styles.receipt} ${
          result.error.code === "DUPLICATE_SOURCE" ? styles.receiptPartial : styles.receiptRejected
        }`}
        role="alert"
      >
        <p className={styles.sectionKicker}>Preservation conflict</p>
        <h2>
          {result.error.code === "DUPLICATE_SOURCE"
            ? "Source already exists"
            : "Source was not preserved"}
        </h2>
        <p>
          {result.error.code === "DUPLICATE_SOURCE"
            ? "No new extraction or preparation was created. Review the existing Source in the Inbox."
            : result.error.message}
        </p>
        <ErrorFacts error={result.error} />
        <dl className={styles.receiptFacts}>
          {result.error.code === "DUPLICATE_SOURCE" ? (
            <>
              <Fact label="Existing Source ID">{result.error.existingSourceId}</Fact>
              <Fact label="Canonical URL">{result.error.canonicalUrl}</Fact>
            </>
          ) : (
            <Fact label="Source ID">{result.error.sourceId}</Fact>
          )}
        </dl>
      </article>
    );

  const error = result.kind === "unavailable" ? null : result.error;
  return (
    <article className={`${styles.receipt} ${styles.receiptRejected}`} role="alert">
      <p className={styles.sectionKicker}>Source intake did not complete</p>
      <h2>{result.kind === "unavailable" ? result.message : result.error.message}</h2>
      {error ? <ErrorFacts error={error} /> : null}
      {result.kind === "preservation-validation-failure" &&
      result.error.code === "SOURCE_URL_TOO_LONG" ? (
        <dl className={styles.receiptFacts}>
          <Fact label="Maximum length">{result.error.maximumLength}</Fact>
        </dl>
      ) : null}
    </article>
  );
}

function latestSuccessful(preparations: readonly SourceEvidencePreparation[]) {
  for (let index = preparations.length - 1; index >= 0; index -= 1) {
    const preparation = preparations[index];
    if (preparation?.outcome === "succeeded") return preparation;
  }
  return null;
}

function EvidenceReview({
  source,
  extraction,
  preparations,
  requestFailure,
}: Readonly<{
  source: UrlSource;
  extraction: Extract<SourceExtraction, { readonly outcome: "succeeded" }>;
  preparations: readonly SourceEvidencePreparation[];
  requestFailure: PreparationRequestFailure | null;
}>) {
  const primary = latestSuccessful(preparations);
  const latest = preparations.at(-1) ?? null;
  const latestDurableFailure = latest?.outcome === "failed" ? latest : null;

  return (
    <article
      className={`${styles.receipt} ${primary ? styles.receiptCompleted : styles.receiptPartial}`}
      role={primary ? "status" : "alert"}
    >
      <p className={styles.sectionKicker}>{primary ? "Source ready" : "Source preserved"}</p>
      <h2>{primary ? "Prepared Evidence" : "Evidence preparation failed"}</h2>
      <ul className={styles.completionChecklist}>
        <li data-stage="completed">Source preserved</li>
        <li data-stage="completed">Article extracted</li>
        <li data-stage={primary ? "completed" : "failed"}>
          {primary ? "Evidence prepared" : "Evidence preparation failed"}
        </li>
      </ul>

      {primary ? (
        <section className={styles.preparedEvidence} aria-labelledby="prepared-evidence-title">
          <header>
            <h3 id="prepared-evidence-title">
              {primary.document.title ?? extraction.document.title ?? "Prepared evidence"}
            </h3>
            {primary.document.byline || primary.document.publishedAt ? (
              <p>
                {[primary.document.byline, primary.document.publishedAt]
                  .filter((value) => value !== null)
                  .join(" · ")}
              </p>
            ) : null}
          </header>
          <SafeMarkdown markdown={primary.document.content} />
        </section>
      ) : null}

      {latestDurableFailure ? (
        <div className={styles.extractionFailure} role="alert">
          <h3>Latest preparation attempt failed</h3>
          <p>
            {latestDurableFailure.failure.code} · retryable:{" "}
            {latestDurableFailure.failure.retryable ? "yes" : "no"}
          </p>
          {primary ? <p>The last successful Prepared Evidence remains available above.</p> : null}
        </div>
      ) : null}

      {requestFailure ? (
        <div className={styles.extractionFailure} role="alert">
          <h3>StoryRail could not request evidence preparation</h3>
          <p>Source and extraction are safe. No preparation record was fabricated.</p>
          <p>
            {requestFailure.kind === "application-failure"
              ? `${requestFailure.error.code} · ${requestFailure.error.message}`
              : requestFailure.message}
          </p>
        </div>
      ) : null}

      <div className={styles.secondaryPanels}>
        <details className={styles.secondaryPanel}>
          <summary>
            <span>
              <strong>Preparation history · {preparations.length} attempts</strong>
              <small>Immutable prepared evidence and provenance</small>
            </span>
          </summary>
          <div className={styles.secondaryPanelContent}>
            {preparations.length === 0 ? (
              <p>No durable preparation record is available.</p>
            ) : (
              preparations.map((preparation) => (
                <PreparationAudit key={preparation.id} preparation={preparation} />
              ))
            )}
          </div>
        </details>
        <details className={styles.secondaryPanel}>
          <summary>
            <span>
              <strong>Raw extraction</strong>
              <small>Exact immutable retrieval evidence</small>
            </span>
          </summary>
          <div className={styles.secondaryPanelContent}>
            <ExtractionFacts extraction={extraction} />
          </div>
        </details>
        <details className={styles.secondaryPanel}>
          <summary>
            <span>
              <strong>Technical details</strong>
              <small>Source, extraction, and preparation records</small>
            </span>
          </summary>
          <div className={styles.secondaryPanelContent}>
            <SourceFacts source={source} />
            <ExtractionFacts extraction={extraction} />
            {latest ? <PreparationAudit preparation={latest} /> : null}
          </div>
        </details>
      </div>
    </article>
  );
}

function reviewableSourceId(state: IntakeState): string | null {
  if (state.kind === "extraction-retry-failed") return state.source.id;
  if (state.kind !== "result") return null;
  const { result } = state;
  if (result.kind === "completed" || result.kind === "partial-completion") return result.source.id;
  return result.kind === "preservation-conflict" && result.error.code === "DUPLICATE_SOURCE"
    ? result.error.existingSourceId
    : null;
}

// Extraction can only be retried where the preserved Source itself is in hand. A duplicate
// conflict carries an identity but no Source, so that path stays a handoff to the Inbox.
function retryableSource(state: IntakeState): UrlSource | null {
  if (state.kind === "extraction-retry-failed") return state.source;
  if (state.kind !== "result") return null;
  const { result } = state;
  if (result.kind === "partial-completion") return result.source;
  return result.kind === "completed" && result.extraction.outcome === "failed"
    ? result.source
    : null;
}

export function SourceEvidenceWorkspace({
  requestSourceEvidence: suppliedRequestSourceEvidence,
  inboxRequests: suppliedInboxRequests,
  onSourceAvailable,
  onReviewInInbox,
}: SourceEvidenceWorkspaceProps) {
  const clients = useNewsroomClients();
  const requestSourceEvidence = suppliedRequestSourceEvidence ?? clients.requestSourceEvidenceUrl;
  const inboxRequests = suppliedInboxRequests ?? clients.sourceInbox;
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [state, setState] = useState<IntakeState>({ kind: "idle" });
  const pendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending =
    state.kind === "preserving" || state.kind === "preparing" || state.kind === "extracting";
  const sourceIdForReview = reviewableSourceId(state);
  const sourceForRetry = retryableSource(state);

  async function prepare(
    source: UrlSource,
    extraction: Extract<SourceExtraction, { readonly outcome: "succeeded" }>,
    priorPreparations: readonly SourceEvidencePreparation[],
  ) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setState({ kind: "preparing", source, extraction, preparations: priorPreparations });
    try {
      const result = await inboxRequests.prepareEvidence(source.id, extraction.id);
      if (result.kind === "completed") {
        setState({
          kind: "review",
          source,
          extraction,
          preparations: [...priorPreparations, result.value],
          requestFailure: null,
        });
      } else {
        setState({
          kind: "review",
          source,
          extraction,
          preparations: priorPreparations,
          requestFailure: result,
        });
      }
    } catch {
      setState({
        kind: "review",
        source,
        extraction,
        preparations: priorPreparations,
        requestFailure: { kind: "unavailable", message: SOURCE_INBOX_UNAVAILABLE_MESSAGE },
      });
    } finally {
      onSourceAvailable?.(source.id);
      pendingRef.current = false;
    }
  }

  // Appends a new extraction attempt to the immutable history. A successful attempt continues
  // straight into preparation so a recovered Source rejoins the ordinary intake path.
  async function retryExtraction(source: UrlSource) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setState({ kind: "extracting", source });

    try {
      const result = await inboxRequests.retryExtraction(source.id);

      if (result.kind === "completed" && result.value.outcome === "succeeded") {
        pendingRef.current = false;
        await prepare(source, result.value, []);
        return;
      }

      setState(
        result.kind === "completed"
          ? { kind: "result", result: { kind: "completed", source, extraction: result.value } }
          : { kind: "extraction-retry-failed", source, failure: result },
      );
    } catch {
      setState({
        kind: "extraction-retry-failed",
        source,
        failure: { kind: "unavailable", message: SOURCE_INBOX_UNAVAILABLE_MESSAGE },
      });
    } finally {
      onSourceAvailable?.(source.id);
      pendingRef.current = false;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setState({ kind: "preserving" });

    try {
      const result = await requestSourceEvidence(submittedUrl);
      if (result.kind === "completed") {
        setSubmittedUrl("");
        if (result.extraction.outcome === "succeeded") {
          pendingRef.current = false;
          await prepare(result.source, result.extraction, []);
          return;
        }
        setState({ kind: "result", result });
        onSourceAvailable?.(result.source.id);
      } else {
        setState({ kind: "result", result });
        if (result.kind === "partial-completion") {
          setSubmittedUrl("");
          onSourceAvailable?.(result.source.id);
        } else if (
          result.kind === "preservation-conflict" &&
          result.error.code === "DUPLICATE_SOURCE"
        ) {
          onSourceAvailable?.(result.error.existingSourceId);
        }
      }
    } catch {
      setState({
        kind: "result",
        result: { kind: "unavailable", message: SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE },
      });
    } finally {
      pendingRef.current = false;
    }
  }

  function reset() {
    setState({ kind: "idle" });
    setSubmittedUrl("");
    inputRef.current?.focus();
  }

  return (
    <section
      className={styles.sourceWorkspace}
      aria-labelledby="source-intake-title"
      aria-busy={pending}
    >
      <header className={styles.sourceWorkspaceHeader}>
        <p className={styles.sectionKicker}>Source intake</p>
        <h1 id="source-intake-title">Add a Source to the newsroom</h1>
        <p>
          StoryRail preserves the URL, extracts raw evidence, and prepares it for editorial review
          when extraction succeeds. Triage remains a separate decision in Source Inbox.
        </p>
      </header>

      {state.kind === "idle" || state.kind === "preserving" ? (
        <form className={styles.sourceForm} onSubmit={submit} aria-busy={pending}>
          <label htmlFor="source-url">Source URL</label>
          <div className={styles.sourceFormControls}>
            <input
              ref={inputRef}
              id="source-url"
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              value={submittedUrl}
              onChange={(event) => setSubmittedUrl(event.currentTarget.value)}
            />
            <button type="submit" disabled={pending}>
              Bring into newsroom
            </button>
          </div>
          <p className={styles.formHint}>The exact submitted value is validated on the server.</p>
          {state.kind === "preserving" ? (
            <p className={styles.pendingStatus} role="status">
              Preserving and extracting Source…
            </p>
          ) : null}
        </form>
      ) : null}

      <div className={styles.resultRegion} aria-live="polite">
        {state.kind === "preparing" ? (
          <article
            className={`${styles.receipt} ${styles.preparationActive}`}
            role="status"
            aria-busy="true"
            aria-labelledby="preparation-active-heading"
          >
            <p className={styles.sectionKicker}>Source preserved</p>
            <h2 id="preparation-active-heading">Preparing evidence…</h2>
            <p className={styles.preparationWaitCopy}>
              StoryRail is preparing the extracted article for editorial review. This can take a few
              seconds.
            </p>
            <ul className={`${styles.completionChecklist} ${styles.preparationChecklist}`}>
              <li data-stage="completed">Source preserved</li>
              <li data-stage="completed">Article extracted</li>
              <li className={styles.preparationActiveStage} data-stage="active">
                Preparing evidence…
              </li>
            </ul>
            <div
              className={styles.preparationActivity}
              data-testid="preparation-activity"
              aria-hidden="true"
            >
              <span />
            </div>
          </article>
        ) : null}
        {state.kind === "extracting" ? (
          <article
            className={`${styles.receipt} ${styles.preparationActive}`}
            role="status"
            aria-busy="true"
            aria-labelledby="extraction-retry-heading"
          >
            <p className={styles.sectionKicker}>Source preserved</p>
            <h2 id="extraction-retry-heading">Extracting again…</h2>
            <p className={styles.preparationWaitCopy}>
              StoryRail is making a new extraction attempt. The earlier attempt stays in the
              Source&rsquo;s history either way.
            </p>
            <ul className={`${styles.completionChecklist} ${styles.preparationChecklist}`}>
              <li data-stage="completed">Source preserved</li>
              <li className={styles.preparationActiveStage} data-stage="active">
                Extracting again…
              </li>
              <li data-stage="skipped">Evidence preparation not attempted</li>
            </ul>
          </article>
        ) : null}
        {state.kind === "extraction-retry-failed" ? (
          <article className={`${styles.receipt} ${styles.receiptRejected}`} role="alert">
            <p className={styles.sectionKicker}>Extraction was not attempted</p>
            <h2>
              {state.failure.kind === "unavailable"
                ? state.failure.message
                : state.failure.error.message}
            </h2>
            <p>
              No new extraction attempt was recorded. The Source and its earlier history are
              unchanged.
            </p>
            {state.failure.kind === "application-failure" ? (
              <ErrorFacts error={state.failure.error} />
            ) : null}
          </article>
        ) : null}
        {state.kind === "review" ? <EvidenceReview {...state} /> : null}
        {state.kind === "result" ? <BasicResult result={state.result} /> : null}

        {state.kind === "review" ? (
          <div className={styles.handoffActions}>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => onReviewInInbox?.(state.source.id)}
            >
              Review in Source Inbox
            </button>
            <button
              type="button"
              className={styles.secondaryAction}
              disabled={pending}
              onClick={() => void prepare(state.source, state.extraction, state.preparations)}
            >
              {state.preparations.length === 0 ? "Retry preparation" : "Prepare again"}
            </button>
            <button type="button" className={styles.secondaryAction} onClick={reset}>
              Add another Source
            </button>
          </div>
        ) : sourceForRetry !== null ? (
          <div className={styles.handoffActions}>
            <button
              type="button"
              className={styles.primaryAction}
              disabled={pending}
              onClick={() => void retryExtraction(sourceForRetry)}
            >
              Try extraction again
            </button>
            {sourceIdForReview !== null ? (
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => onReviewInInbox?.(sourceIdForReview)}
              >
                Review in Source Inbox
              </button>
            ) : null}
            <button type="button" className={styles.secondaryAction} onClick={reset}>
              Add another Source
            </button>
          </div>
        ) : sourceIdForReview !== null ? (
          <div className={styles.handoffActions}>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => onReviewInInbox?.(sourceIdForReview)}
            >
              Review in Source Inbox
            </button>
            <button type="button" className={styles.secondaryAction} onClick={reset}>
              Add another Source
            </button>
          </div>
        ) : state.kind === "result" ? (
          <div className={styles.handoffActions}>
            <button type="button" className={styles.secondaryAction} onClick={reset}>
              Try another Source
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
