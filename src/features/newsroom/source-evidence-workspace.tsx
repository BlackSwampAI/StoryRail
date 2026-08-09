"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";

import type { EditorialActor, SourceExtraction, UrlSource } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import {
  requestSourceEvidenceUrl,
  SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE,
  type RequestSourceEvidenceUrl,
  type SourceEvidenceApplicationError,
  type SourceEvidenceUrlResult,
} from "./source-evidence-url-client";

export interface SourceEvidenceWorkspaceProps {
  readonly requestSourceEvidence?: RequestSourceEvidenceUrl;
}

function ActorValue({ actor }: Readonly<{ actor: EditorialActor }>) {
  if (actor.type === "operator") {
    return (
      <>
        operator: <span>{actor.operatorId}</span>
      </>
    );
  }

  return (
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

function Timestamp({ value }: Readonly<{ value: string }>) {
  return <time dateTime={value}>{value}</time>;
}

function SourceFacts({ source }: Readonly<{ source: UrlSource }>) {
  return (
    <section className={styles.receiptSection} aria-labelledby="source-receipt-heading">
      <h3 id="source-receipt-heading">Preserved Source</h3>
      <dl className={styles.receiptFacts}>
        <Fact label="Source ID">{source.id}</Fact>
        <Fact label="Type">{source.type}</Fact>
        <Fact label="Exact submitted URL">{source.submittedUrl}</Fact>
        <Fact label="Canonical URL">{source.canonicalUrl}</Fact>
        <Fact label="Submitting actor">
          <ActorValue actor={source.submittedBy} />
        </Fact>
        <Fact label="Received timestamp">
          <Timestamp value={source.receivedAt} />
        </Fact>
      </dl>
    </section>
  );
}

function ExtractionFacts({ extraction }: Readonly<{ extraction: SourceExtraction }>) {
  return (
    <section className={styles.receiptSection} aria-labelledby="extraction-receipt-heading">
      <h3 id="extraction-receipt-heading">Extraction receipt</h3>
      <dl className={styles.receiptFacts}>
        <Fact label="Extraction ID">{extraction.id}</Fact>
        <Fact label="Source ID">{extraction.sourceId}</Fact>
        <Fact label="Extractor key">{extraction.extractor.key}</Fact>
        <Fact label="Extractor version">{extraction.extractor.version}</Fact>
        <Fact label="Requesting actor">
          <ActorValue actor={extraction.requestedBy} />
        </Fact>
        <Fact label="Started timestamp">
          <Timestamp value={extraction.startedAt} />
        </Fact>
        <Fact label="Completed timestamp">
          <Timestamp value={extraction.completedAt} />
        </Fact>
        <Fact label="Outcome">{extraction.outcome}</Fact>
      </dl>

      {extraction.outcome === "succeeded" ? (
        <>
          <h4>Extracted document</h4>
          <dl className={styles.receiptFacts}>
            <Fact label="Document format">{extraction.document.format}</Fact>
            <Fact label="Title">{extraction.document.title ?? "Unavailable"}</Fact>
            <Fact label="Byline">{extraction.document.byline ?? "Unavailable"}</Fact>
            <Fact label="Publication timestamp">
              {extraction.document.publishedAt === null ? (
                "Unavailable"
              ) : (
                <Timestamp value={extraction.document.publishedAt} />
              )}
            </Fact>
            <Fact label="Language">{extraction.document.language ?? "Unavailable"}</Fact>
          </dl>
          <h4>Extracted Markdown</h4>
          <pre className={styles.extractedContent}>{extraction.document.content}</pre>
        </>
      ) : (
        <dl className={styles.receiptFacts}>
          <Fact label="Failure code">{extraction.failure.code}</Fact>
          <Fact label="Retryable">{extraction.failure.retryable ? "Yes" : "No"}</Fact>
        </dl>
      )}
    </section>
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

type ResultOfKind<Kind extends SourceEvidenceUrlResult["kind"]> = Extract<
  SourceEvidenceUrlResult,
  { readonly kind: Kind }
>;

function ValidationErrorFacts({
  error,
}: Readonly<{ error: ResultOfKind<"preservation-validation-failure">["error"] }>) {
  return (
    <>
      <ErrorFacts error={error} />
      {error.code === "SOURCE_URL_TOO_LONG" ? (
        <dl className={styles.receiptFacts}>
          <Fact label="Maximum length">{error.maximumLength}</Fact>
        </dl>
      ) : null}
    </>
  );
}

function ConflictErrorFacts({
  error,
}: Readonly<{ error: ResultOfKind<"preservation-conflict">["error"] }>) {
  return (
    <>
      <ErrorFacts error={error} />
      <dl className={styles.receiptFacts}>
        {error.code === "DUPLICATE_SOURCE" ? (
          <>
            <Fact label="Existing Source ID">{error.existingSourceId}</Fact>
            <Fact label="Canonical URL">{error.canonicalUrl}</Fact>
          </>
        ) : (
          <Fact label="Source ID">{error.sourceId}</Fact>
        )}
      </dl>
    </>
  );
}

function ExtractionErrorFacts({
  error,
}: Readonly<{ error: ResultOfKind<"partial-completion">["error"] }>) {
  return (
    <>
      <ErrorFacts error={error} />
      {error.code === "SOURCE_NOT_FOUND" || error.code === "SOURCE_EXTRACTION_ID_CONFLICT" ? (
        <dl className={styles.receiptFacts}>
          {error.code === "SOURCE_NOT_FOUND" ? (
            <Fact label="Source ID">{error.sourceId}</Fact>
          ) : (
            <Fact label="Extraction ID">{error.extractionId}</Fact>
          )}
        </dl>
      ) : null}
    </>
  );
}

function ResultReceipt({ result }: Readonly<{ result: SourceEvidenceUrlResult }>) {
  switch (result.kind) {
    case "completed":
      return (
        <article className={`${styles.receipt} ${styles.receiptCompleted}`} role="status">
          <p className={styles.sectionKicker}>Completed operation</p>
          <h2>
            {result.extraction.outcome === "succeeded"
              ? "Source preserved and extraction completed"
              : "Source preserved; extraction failure recorded"}
          </h2>
          <SourceFacts source={result.source} />
          <ExtractionFacts extraction={result.extraction} />
        </article>
      );
    case "preservation-validation-failure":
      return (
        <article className={`${styles.receipt} ${styles.receiptRejected}`} role="alert">
          <p className={styles.sectionKicker}>Preservation validation failure</p>
          <h2>Source was not preserved because URL validation failed</h2>
          <ValidationErrorFacts error={result.error} />
        </article>
      );
    case "preservation-conflict":
      return (
        <article className={`${styles.receipt} ${styles.receiptRejected}`} role="alert">
          <p className={styles.sectionKicker}>Preservation conflict</p>
          <h2>Source was not preserved because preservation conflicted</h2>
          <ConflictErrorFacts error={result.error} />
        </article>
      );
    case "partial-completion":
      return (
        <article className={`${styles.receipt} ${styles.receiptPartial}`} role="alert">
          <p className={styles.sectionKicker}>Partial completion</p>
          <h2>Source preserved; extraction could not complete</h2>
          <SourceFacts source={result.source} />
          <section className={styles.receiptSection} aria-labelledby="partial-error-heading">
            <h3 id="partial-error-heading">Extraction-stage application failure</h3>
            <dl className={styles.receiptFacts}>
              <Fact label="Stage">{result.stage}</Fact>
            </dl>
            <ExtractionErrorFacts error={result.error} />
          </section>
        </article>
      );
    case "interface-rejection":
      return (
        <article className={`${styles.receipt} ${styles.receiptRejected}`} role="alert">
          <p className={styles.sectionKicker}>Interface-request rejection</p>
          <h2>The Source evidence interface rejected the request</h2>
          <ErrorFacts error={result.error} />
        </article>
      );
    case "internal-failure":
      return (
        <article className={`${styles.receipt} ${styles.receiptRejected}`} role="alert">
          <p className={styles.sectionKicker}>Application failure</p>
          <h2>The Source evidence operation failed</h2>
          <ErrorFacts error={result.error} />
        </article>
      );
    case "unavailable":
      return (
        <article className={`${styles.receipt} ${styles.receiptRejected}`} role="alert">
          <p className={styles.sectionKicker}>Unavailable response</p>
          <h2>{result.message}</h2>
        </article>
      );
  }
}

export function SourceEvidenceWorkspace({
  requestSourceEvidence = requestSourceEvidenceUrl,
}: SourceEvidenceWorkspaceProps) {
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SourceEvidenceUrlResult | null>(null);
  const pendingRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setPending(true);

    try {
      setResult(await requestSourceEvidence(submittedUrl));
    } catch {
      setResult({ kind: "unavailable", message: SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <section
      className={styles.sourceWorkspace}
      aria-labelledby="source-intake-title"
      aria-busy={pending}
    >
      <header className={styles.sourceWorkspaceHeader}>
        <p className={styles.sectionKicker}>Source intake</p>
        <h1 id="source-intake-title">Preserve one URL as Source evidence</h1>
        <p>
          Submit a caller-controlled URL to preserve the Source and attempt extraction. A preserved
          Source is not attached to a Story; Source attachment remains a separate future workflow.
        </p>
      </header>

      <form className={styles.sourceForm} onSubmit={submit} aria-busy={pending}>
        <label htmlFor="source-url">Source URL</label>
        <div className={styles.sourceFormControls}>
          <input
            id="source-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={submittedUrl}
            onChange={(event) => setSubmittedUrl(event.currentTarget.value)}
          />
          <button type="submit" disabled={pending}>
            Preserve and extract
          </button>
        </div>
        <p className={styles.formHint}>The server validates and canonicalizes the exact value.</p>
        {pending ? (
          <p className={styles.pendingStatus} role="status">
            Preserving the Source and attempting extraction…
          </p>
        ) : null}
      </form>

      <div className={styles.resultRegion} aria-live="polite" aria-atomic="true">
        {result === null ? null : <ResultReceipt result={result} />}
      </div>
    </section>
  );
}
