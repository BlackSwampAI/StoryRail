"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";

import type { StoryInspection } from "@/application/story-inspection";
import type { EditorialActor, SourceExtraction, Story, UrlSource } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import {
  requestSourceEvidenceUrl,
  SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE,
  type RequestSourceEvidenceUrl,
  type SourceEvidenceApplicationError,
  type SourceEvidenceUrlResult,
} from "./source-evidence-url-client";
import {
  storyClient,
  STORY_REQUEST_UNAVAILABLE_MESSAGE,
  type StoryClient,
  type StoryClientApplicationError,
} from "./story-client";

export interface SourceEvidenceWorkspaceProps {
  readonly requestSourceEvidence?: RequestSourceEvidenceUrl;
  readonly storyRequests?: StoryClient;
  readonly onStoryLoaded?: (inspection: StoryInspection) => void;
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
        <article
          className={`${styles.receipt} ${
            result.error.code === "DUPLICATE_SOURCE"
              ? styles.receiptPartial
              : styles.receiptRejected
          }`}
          role="alert"
        >
          <p className={styles.sectionKicker}>Preservation conflict</p>
          <h2>
            {result.error.code === "DUPLICATE_SOURCE"
              ? "Source already exists and can be reused"
              : "Source was not preserved because preservation conflicted"}
          </h2>
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

interface EligibleSource {
  readonly sourceId: string;
  readonly suggestedTitle: string;
}

function eligibleSource(result: SourceEvidenceUrlResult): EligibleSource | null {
  if (result.kind === "completed") {
    const title =
      result.extraction.outcome === "succeeded" ? result.extraction.document.title?.trim() : "";
    return { sourceId: result.source.id, suggestedTitle: title ?? "" };
  }
  if (result.kind === "partial-completion") {
    return { sourceId: result.source.id, suggestedTitle: "" };
  }
  if (result.kind === "preservation-conflict" && result.error.code === "DUPLICATE_SOURCE") {
    return { sourceId: result.error.existingSourceId, suggestedTitle: "" };
  }
  return null;
}

type StoryProgress =
  | { readonly kind: "idle" }
  | { readonly kind: "creating" }
  | { readonly kind: "attaching"; readonly story: Story }
  | { readonly kind: "inspecting"; readonly story: Story }
  | { readonly kind: "create-failure"; readonly error: StoryClientApplicationError | null }
  | {
      readonly kind: "attachment-failure";
      readonly story: Story;
      readonly error: StoryClientApplicationError | null;
    }
  | { readonly kind: "inspection-failure"; readonly story: Story }
  | { readonly kind: "completed"; readonly story: Story };

function StoryCreationForm({
  eligible,
  requests,
  onStoryLoaded,
}: Readonly<{
  eligible: EligibleSource;
  requests: StoryClient;
  onStoryLoaded?: (inspection: StoryInspection) => void;
}>) {
  const [title, setTitle] = useState(eligible.suggestedTitle);
  const [relevance, setRelevance] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState<StoryProgress>({ kind: "idle" });
  const pendingRef = useRef(false);
  const pending = ["creating", "attaching", "inspecting"].includes(progress.kind);
  const storyExists = [
    "attaching",
    "inspecting",
    "attachment-failure",
    "inspection-failure",
    "completed",
  ].includes(progress.kind);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setProgress({ kind: "creating" });

    try {
      let creation: Awaited<ReturnType<StoryClient["createStory"]>>;
      try {
        creation = await requests.createStory(title);
      } catch {
        setProgress({ kind: "create-failure", error: null });
        return;
      }
      if (creation.kind !== "completed") {
        setProgress({
          kind: "create-failure",
          error: creation.kind === "application-failure" ? creation.error : null,
        });
        return;
      }

      const story = creation.value;
      setProgress({ kind: "attaching", story });
      let attachment: Awaited<ReturnType<StoryClient["attachSource"]>>;
      try {
        attachment = await requests.attachSource(story.id, eligible.sourceId, relevance);
      } catch {
        setProgress({ kind: "attachment-failure", story, error: null });
        return;
      }
      if (attachment.kind !== "completed") {
        setProgress({
          kind: "attachment-failure",
          story,
          error: attachment.kind === "application-failure" ? attachment.error : null,
        });
        return;
      }

      setProgress({ kind: "inspecting", story });
      let inspection: Awaited<ReturnType<StoryClient["inspectStory"]>>;
      try {
        inspection = await requests.inspectStory(story.id);
      } catch {
        setProgress({ kind: "inspection-failure", story });
        return;
      }
      if (inspection.kind !== "completed") {
        setProgress({ kind: "inspection-failure", story });
        return;
      }
      setProgress({ kind: "completed", story });
      onStoryLoaded?.(inspection.value);
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <section className={styles.storyCreation} aria-labelledby="story-creation-title">
      <p className={styles.sectionKicker}>Editorial action</p>
      <h2 id="story-creation-title">Create Story from Source</h2>
      <p>This explicitly creates a durable Story, then attaches Source {eligible.sourceId}.</p>
      {!expanded ? (
        <button
          className={styles.storyCreationAction}
          type="button"
          onClick={() => setExpanded(true)}
        >
          Create Story from Source
        </button>
      ) : (
        <form className={styles.storyCreationForm} onSubmit={create} aria-busy={pending}>
          <label htmlFor="story-title">Story title</label>
          <input
            id="story-title"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <label htmlFor="source-relevance">Why is this Source relevant?</label>
          <textarea
            id="source-relevance"
            value={relevance}
            onChange={(event) => setRelevance(event.currentTarget.value)}
          />
          <button type="submit" disabled={pending || storyExists}>
            {storyExists && !pending ? "Story already created" : "Create Story"}
          </button>
          {pending ? (
            <p className={styles.pendingStatus} role="status">
              {progress.kind === "creating"
                ? "Creating Story…"
                : progress.kind === "attaching"
                  ? "Attaching Source…"
                  : "Loading Story…"}
            </p>
          ) : null}
        </form>
      )}
      {progress.kind === "create-failure" ? (
        <div className={styles.workflowFailure} role="alert">
          <h3>Story was not created</h3>
          <p>{progress.error?.message ?? STORY_REQUEST_UNAVAILABLE_MESSAGE}</p>
          {progress.error ? <p>Error code: {progress.error.code}</p> : null}
        </div>
      ) : null}
      {progress.kind === "attachment-failure" ? (
        <div className={styles.workflowPartial} role="alert">
          <h3>Story created; Source not attached</h3>
          <p>
            “{progress.story.title}” already exists as Story {progress.story.id}. The Source could
            not be attached; the Story was not rolled back or deleted.
          </p>
          <p>{progress.error?.message ?? STORY_REQUEST_UNAVAILABLE_MESSAGE}</p>
        </div>
      ) : null}
      {progress.kind === "inspection-failure" ? (
        <div className={styles.workflowPartial} role="alert">
          <h3>Story and Source attachment completed; Story could not be loaded</h3>
          <p>
            “{progress.story.title}” ({progress.story.id}) and its attachment may already be
            durable. They were not rolled back.
          </p>
        </div>
      ) : null}
      {progress.kind === "completed" ? (
        <p className={styles.workflowCompleted} role="status">
          Story created, Source attached, and persisted Story loaded.
        </p>
      ) : null}
    </section>
  );
}

export function SourceEvidenceWorkspace({
  requestSourceEvidence = requestSourceEvidenceUrl,
  storyRequests = storyClient,
  onStoryLoaded,
}: SourceEvidenceWorkspaceProps) {
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SourceEvidenceUrlResult | null>(null);
  const pendingRef = useRef(false);
  const eligible = result === null ? null : eligibleSource(result);

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
          Source remains distinct from a Story; after preservation, you may explicitly create a
          Story and attach it.
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
      {eligible === null ? null : (
        <StoryCreationForm
          key={`${eligible.sourceId}:${eligible.suggestedTitle}`}
          eligible={eligible}
          requests={storyRequests}
          onStoryLoaded={onStoryLoaded}
        />
      )}
    </section>
  );
}
