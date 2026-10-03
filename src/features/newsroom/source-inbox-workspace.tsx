"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import type { SourceInboxItem } from "@/application/source-inbox";
import type { StoryInspection } from "@/application/story-inspection";
import type { StoryListItem } from "@/application/story-listing";
import type {
  EditorialActor,
  SourceEvidencePreparation,
  SourceExtraction,
  SourceExtractionId,
  Story,
  StoryPurpose,
} from "@/domain/editorial";
import type { PublicationBrief } from "@/domain/editorial/newsroom-standards-types";
import { MAXIMUM_STORY_PURPOSE_FIELD_CHARACTERS } from "@/domain/editorial/story-creation-types";

import styles from "./newsroom-shell.module.css";
import { modelFailureExplanation } from "./model-failure";
import { useNewsroomClients } from "./newsroom-clients";
import { SafeMarkdown } from "./safe-markdown";
import {
  SOURCE_INBOX_UNAVAILABLE_MESSAGE,
  type SourceInboxClient,
  type SourceInboxClientError,
} from "./source-inbox-client";
import type { StoryClient, StoryClientApplicationError } from "./story-client";

type InboxState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded";
      readonly refreshVersion: number;
      readonly items: readonly SourceInboxItem[];
    }
  | { readonly kind: "unavailable"; readonly refreshVersion: number };

const DEFAULT_READER_VALUE = "Investigate what this source means for our readers";
const DEFAULT_SOURCE_CONTRIBUTION =
  "Use this Source as starting evidence only where it directly supports the Story.";
const TRIAGE_REASON = {
  skip: "Skipped this Source in Source Inbox; no additional reason supplied.",
} as const;

export interface SourceInboxWorkspaceProps {
  readonly refreshVersion: number;
  readonly focusedSourceId?: string | null;
  readonly stories: readonly StoryListItem[];
  readonly inboxRequests?: SourceInboxClient;
  readonly storyRequests?: StoryClient;
  readonly onPendingCountChange?: (count: number | null) => void;
  readonly onStoryKnown: (story: Story, sourceCount: number) => void;
  readonly onStoryLoaded: (inspection: StoryInspection) => void;
}

function extractedTitle(item: SourceInboxItem): string {
  for (let index = item.extractions.length - 1; index >= 0; index -= 1) {
    const extraction = item.extractions[index];
    if (extraction?.outcome === "succeeded") return extraction.document.title?.trim() ?? "";
  }
  return "";
}

function readerValueSuggestion(item: SourceInboxItem, brief: PublicationBrief | null): string {
  const title = excerpt(extractedTitle(item) || "this source", 80);
  const audience = excerpt(brief?.audience.trim() || "our readers", 90);
  const benefit = excerpt(
    brief?.readerBenefit.trim() || "understand what changes and what happens next",
    90,
  );
  return `What does “${title}” mean for ${audience}? Investigate how it relates to: ${benefit}.`;
}

function contributionSuggestion(item: SourceInboxItem, brief: PublicationBrief | null): string {
  const title = excerpt(extractedTitle(item) || "this page", 80);
  const audience = excerpt(brief?.audience.trim() || "our readers", 80);
  const benefit = excerpt(
    brief?.readerBenefit.trim() || "understand what changes and what happens next",
    90,
  );
  return `Use “${title}” to investigate ${benefit} for ${audience}. Identify what evidence it adds and what remains unanswered.`;
}

function excerpt(text: string, maximum: number): string {
  const trimmed = text.trim();
  return trimmed.length <= maximum ? trimmed : `${trimmed.slice(0, maximum - 1).trimEnd()}…`;
}

function actorLabel(actor: EditorialActor): string {
  return actor.type === "operator"
    ? `operator: ${actor.operatorId}`
    : `agent: ${actor.role}, run ${actor.runId}`;
}

// Prepared Evidence derived from part of the raw extraction is still valid evidence, but the
// operator has to be able to tell it apart from a preparation that saw the whole page.
function truncatedShare(input: SourceEvidencePreparation["input"]): string | null {
  if (input.submittedCharacters >= input.rawCharacters) return null;
  const percent = Math.round((input.submittedCharacters / input.rawCharacters) * 100);
  return `The model read the first ${input.submittedCharacters.toLocaleString()} of ${input.rawCharacters.toLocaleString()} characters (${percent}%) of the raw extraction.`;
}

function PreparationRecord({
  preparation,
  attemptNumber,
}: Readonly<{ preparation: SourceEvidencePreparation; attemptNumber: number }>) {
  return (
    <article className={styles.persistedExtraction}>
      <header className={styles.extractionHeader}>
        <h6>Prepared evidence attempt {attemptNumber}</h6>
        <span>{preparation.outcome === "succeeded" ? "Succeeded" : "Failed"}</span>
      </header>
      {truncatedShare(preparation.input) ? (
        <p className={styles.noExtraction}>{truncatedShare(preparation.input)}</p>
      ) : null}
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
          <h6>Exact prepared Markdown</h6>
          <pre className={styles.extractedContent}>{preparation.document.content}</pre>
        </>
      ) : (
        <div className={styles.extractionFailure}>
          <h6>Evidence preparation failed</h6>
          <p>{modelFailureExplanation(preparation.failure.code)}</p>
          <p className={styles.formHint}>
            {preparation.failure.code} · retryable: {preparation.failure.retryable ? "yes" : "no"}
          </p>
        </div>
      )}
      <details className={styles.extractionAudit}>
        <summary>Technical preparation record</summary>
        <p>Preparation ID: {preparation.id}</p>
        <p>Source extraction ID: {preparation.extractionId}</p>
        <p>Provider: {preparation.model.provider}</p>
        <p>Model: {preparation.model.model}</p>
        <p>
          Preparer: {preparation.preparer.key} / {preparation.preparer.version}
        </p>
        <p>Requested by: {actorLabel(preparation.requestedBy)}</p>
        <p>Raw evidence characters: {preparation.input.rawCharacters}</p>
        <p>Characters submitted to the model: {preparation.input.submittedCharacters}</p>
        <p>Started: {preparation.startedAt}</p>
        <p>Completed: {preparation.completedAt}</p>
        <p>Outcome: {preparation.outcome}</p>
      </details>
    </article>
  );
}

function Evidence({
  item,
  extractions,
  preparations,
  preparingExtractionId,
  preparationMessage,
  extracting,
  extractionMessage,
  onPrepare,
  onRetryExtraction,
}: Readonly<{
  item: SourceInboxItem;
  extractions: readonly SourceExtraction[];
  preparations: readonly SourceEvidencePreparation[];
  preparingExtractionId: SourceExtractionId | null;
  preparationMessage: string | null;
  extracting: boolean;
  extractionMessage: string | null;
  onPrepare: (extractionId: SourceExtractionId) => void;
  onRetryExtraction: () => void;
}>) {
  const latestSuccessfulExtraction = [...extractions]
    .reverse()
    .find((extraction) => extraction.outcome === "succeeded");
  const latestSuccessfulPreparation = [...preparations]
    .reverse()
    .find((preparation) => preparation.outcome === "succeeded");
  const latestPreparation = preparations.at(-1) ?? null;
  const latestAttemptFailed = latestPreparation?.outcome === "failed" ? latestPreparation : null;

  return (
    <div className={styles.persistedEvidence}>
      <h4>Prepared Evidence</h4>
      {latestSuccessfulPreparation ? (
        <section className={styles.preparedEvidence}>
          <header>
            <h5>
              {latestSuccessfulPreparation.document.title ??
                (latestSuccessfulExtraction?.outcome === "succeeded"
                  ? latestSuccessfulExtraction.document.title
                  : null) ??
                "Prepared evidence"}
            </h5>
            {latestSuccessfulPreparation.document.byline ||
            latestSuccessfulPreparation.document.publishedAt ? (
              <p>
                {[
                  latestSuccessfulPreparation.document.byline,
                  latestSuccessfulPreparation.document.publishedAt,
                ]
                  .filter((value) => value !== null)
                  .join(" · ")}
              </p>
            ) : null}
          </header>
          <SafeMarkdown markdown={latestSuccessfulPreparation.document.content} />
        </section>
      ) : (
        <div className={styles.noExtraction}>
          <p>No prepared evidence is available.</p>
          {latestSuccessfulExtraction?.outcome === "succeeded" ? (
            <button
              type="button"
              disabled={preparingExtractionId !== null}
              onClick={() => onPrepare(latestSuccessfulExtraction.id)}
            >
              {preparingExtractionId === latestSuccessfulExtraction.id
                ? "Preparing evidence…"
                : "Prepare evidence"}
            </button>
          ) : (
            <>
              <p>No successful extraction is available to prepare.</p>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={extracting}
                onClick={onRetryExtraction}
              >
                {extracting ? "Extracting again…" : "Try extraction again"}
              </button>
            </>
          )}
        </div>
      )}
      {extractionMessage ? (
        <p className={styles.pendingStatus} role="status">
          {extractionMessage}
        </p>
      ) : null}
      {latestAttemptFailed ? (
        <div className={styles.extractionFailure} role="alert">
          <h5>Latest preparation attempt failed</h5>
          <p>
            {latestAttemptFailed.failure.code} · retryable:{" "}
            {latestAttemptFailed.failure.retryable ? "yes" : "no"}
          </p>
          {latestSuccessfulPreparation ? (
            <p>The latest successful Prepared Evidence remains primary.</p>
          ) : null}
        </div>
      ) : null}
      {latestSuccessfulPreparation && latestSuccessfulExtraction?.outcome === "succeeded" ? (
        <button
          type="button"
          className={styles.secondaryAction}
          disabled={preparingExtractionId !== null}
          onClick={() => onPrepare(latestSuccessfulExtraction.id)}
        >
          {preparingExtractionId === latestSuccessfulExtraction.id
            ? "Preparing evidence…"
            : "Prepare again"}
        </button>
      ) : null}
      {preparationMessage ? (
        <p className={styles.pendingStatus} role="status">
          {preparationMessage}
        </p>
      ) : null}
      <details className={styles.rawExtractionHistory}>
        <summary>
          <span className={styles.disclosureLabel}>
            <span className={styles.disclosureChevron} aria-hidden="true">
              ›
            </span>
            Preparation history
          </span>
          <span>{preparations.length} attempts</span>
        </summary>
        {preparations.length === 0 ? (
          <p className={styles.noExtraction}>No preparation is recorded for this Source.</p>
        ) : (
          preparations.map((preparation, index) => (
            <PreparationRecord
              key={preparation.id}
              preparation={preparation}
              attemptNumber={index + 1}
            />
          ))
        )}
      </details>
      <details className={styles.rawExtractionHistory}>
        <summary>
          <span className={styles.disclosureLabel}>
            <span className={styles.disclosureChevron} aria-hidden="true">
              ›
            </span>
            Raw extraction history
          </span>
          <span>{item.extractions.length} attempts</span>
        </summary>
        {item.extractions.length === 0 ? (
          <p className={styles.noExtraction}>No extraction is recorded for this Source.</p>
        ) : (
          item.extractions.map((extraction, index) => (
            <article className={styles.persistedExtraction} key={extraction.id}>
              <header className={styles.extractionHeader}>
                <h5>Extraction attempt {index + 1}</h5>
                <span>{extraction.outcome === "succeeded" ? "Succeeded" : "Failed"}</span>
              </header>
              {extraction.outcome === "succeeded" ? (
                <>
                  <p>{extraction.document.title ?? "Title unavailable"}</p>
                  <h6>RAW EXTRACTION · actual persisted Markdown</h6>
                  <pre className={styles.extractedContent}>{extraction.document.content}</pre>
                </>
              ) : (
                <div className={styles.extractionFailure}>
                  <h6>Extraction failed</h6>
                  <p>
                    {extraction.failure.code} · retryable:{" "}
                    {extraction.failure.retryable ? "yes" : "no"}
                  </p>
                </div>
              )}
              <details className={styles.extractionAudit}>
                <summary>Technical extraction record</summary>
                <p>Extraction ID: {extraction.id}</p>
                <p>
                  Extractor: {extraction.extractor.key} / {extraction.extractor.version}
                </p>
                <p>Started: {extraction.startedAt}</p>
                <p>Completed: {extraction.completedAt}</p>
              </details>
            </article>
          ))
        )}
      </details>
    </div>
  );
}

type Action = "new" | "existing" | "skip" | null;
type Progress =
  | { readonly kind: "idle" }
  | { readonly kind: "pending"; readonly stage: string }
  | {
      readonly kind: "failure";
      readonly message: string;
      readonly error?: SourceInboxClientError | StoryClientApplicationError;
    }
  | {
      readonly kind: "partial";
      readonly message: string;
      readonly story?: Story;
      readonly retryTriage?: {
        readonly decision: "new_story" | "existing_story";
        readonly sourceCount: number;
        readonly reason: string;
      };
      readonly retryAttachment?: {
        readonly relevance: string;
        readonly reason: string;
      };
    }
  | {
      readonly kind: "completed";
      readonly decision: "new_story" | "existing_story" | "skip";
      readonly message: string;
      readonly inspection?: StoryInspection;
    };

function TriageItem({
  item,
  stories,
  inboxRequests,
  storyRequests,
  onResolved,
  onDecisionCompleted,
  onStoryKnown,
  onStoryLoaded,
  focusRequested,
  publicationBrief,
}: Readonly<{
  item: SourceInboxItem;
  stories: readonly StoryListItem[];
  inboxRequests: SourceInboxClient;
  storyRequests: StoryClient;
  onResolved: () => void;
  onDecisionCompleted: () => void;
  onStoryKnown: SourceInboxWorkspaceProps["onStoryKnown"];
  onStoryLoaded: SourceInboxWorkspaceProps["onStoryLoaded"];
  focusRequested: boolean;
  publicationBrief: PublicationBrief | null;
}>) {
  const [action, setAction] = useState<Action>(null);
  const [title, setTitle] = useState(extractedTitle(item));
  const [storyIdentity, setStoryIdentity] = useState<string>(stories[0]?.story.id ?? "");
  const [readerValue, setReaderValue] = useState(DEFAULT_READER_VALUE);
  const [focus, setFocus] = useState("");
  const [contribution, setContribution] = useState(DEFAULT_SOURCE_CONTRIBUTION);
  const [skipReason, setSkipReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Progress>({ kind: "idle" });
  const [preparations, setPreparations] = useState(item.preparations);
  const [preparingExtractionId, setPreparingExtractionId] = useState<SourceExtractionId | null>(
    null,
  );
  const [preparationMessage, setPreparationMessage] = useState<string | null>(null);
  const [extractions, setExtractions] = useState(item.extractions);
  const [extracting, setExtracting] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const preparationPendingRef = useRef(false);
  const extractionPendingRef = useRef(false);
  const itemRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focusRequested) itemRef.current?.focus();
  }, [focusRequested]);

  async function prepare(extractionId: SourceExtractionId) {
    if (preparationPendingRef.current) return;
    preparationPendingRef.current = true;
    setPreparingExtractionId(extractionId);
    setPreparationMessage("Preparing evidence…");
    try {
      const result = await inboxRequests.prepareEvidence(item.source.id, extractionId);
      if (result.kind === "completed") {
        setPreparations((current) => [...current, result.value]);
        setPreparationMessage(
          result.value.outcome === "succeeded"
            ? "Prepared evidence recorded"
            : "Evidence preparation failed",
        );
      } else {
        setPreparationMessage(
          result.kind === "application-failure"
            ? `Evidence preparation failed: ${result.error.message}`
            : "Evidence preparation outcome is unavailable.",
        );
      }
    } finally {
      preparationPendingRef.current = false;
      setPreparingExtractionId(null);
    }
  }

  // Appends a new extraction attempt. A recovered Source is prepared immediately so the
  // operator lands on reviewable evidence rather than another button.
  async function retryExtraction() {
    if (extractionPendingRef.current) return;
    extractionPendingRef.current = true;
    setExtracting(true);
    setExtractionMessage("Extracting again…");
    try {
      const result = await inboxRequests.retryExtraction(item.source.id);
      if (result.kind === "completed") {
        setExtractions((current) => [...current, result.value]);
        if (result.value.outcome === "succeeded") {
          setExtractionMessage("Extraction recorded");
          extractionPendingRef.current = false;
          setExtracting(false);
          await prepare(result.value.id);
          return;
        }
        setExtractionMessage(
          `Extraction failed again: ${result.value.failure.code} · retryable: ${
            result.value.failure.retryable ? "yes" : "no"
          }`,
        );
      } else {
        setExtractionMessage(
          result.kind === "application-failure"
            ? `Extraction was not attempted: ${result.error.message}`
            : "Extraction outcome is unavailable.",
        );
      }
    } finally {
      extractionPendingRef.current = false;
      setExtracting(false);
    }
  }

  function open(next: Exclude<Action, null>) {
    if (progress.kind === "partial" && progress.story !== undefined) return;
    setAction(next);
    setErrors({});
    setProgress({ kind: "idle" });
  }

  function validate(fields: readonly ("title" | "story")[]): boolean {
    const values = { title, story: storyIdentity };
    const messages = {
      title: "Enter a non-empty Story title.",
      story: "Choose an existing Story.",
    };
    const next: Record<string, string> = {};
    for (const field of fields)
      if (values[field].trim().length === 0) next[field] = messages[field];
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function inspect(story: Story, knownSourceCount: number): Promise<StoryInspection | null> {
    setProgress({ kind: "pending", stage: "Loading authoritative Story…" });
    const result = await storyRequests.inspectStory(story.id);
    if (result.kind === "completed") {
      return result.value;
    } else {
      onStoryKnown(story, knownSourceCount);
      setProgress({
        kind: "partial",
        story,
        message: "Triage is durable, but the authoritative Story inspection could not be loaded.",
      });
      return null;
    }
  }

  async function createNew(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current || !validate(["title"])) return;
    pendingRef.current = true;
    const purpose: StoryPurpose = {
      readerValue: readerValue.trim() || DEFAULT_READER_VALUE,
      focus: focus.trim(),
    };
    const sourceContribution = `Starting evidence for this Story; investigate: ${purpose.readerValue}${
      purpose.focus ? ` Focus: ${purpose.focus}` : ""
    }`;
    const decisionReason = `Covered this Source to investigate: ${purpose.readerValue}${
      purpose.focus ? ` Focus: ${purpose.focus}` : ""
    }`;
    try {
      setProgress({ kind: "pending", stage: "Creating Story…" });
      const creation = await storyRequests.createStory(title, purpose);
      if (creation.kind !== "completed") {
        setProgress({
          kind: "failure",
          message: "Story was not created; the Source remains pending.",
          error: creation.kind === "application-failure" ? creation.error : undefined,
        });
        return;
      }
      const story = creation.value;
      onStoryKnown(story, 0);
      setProgress({ kind: "pending", stage: "Attaching Source…" });
      const attachment = await storyRequests.attachSource(
        story.id,
        item.source.id,
        sourceContribution,
      );
      if (attachment.kind !== "completed") {
        setProgress({
          kind: "partial",
          story,
          message:
            attachment.kind === "application-failure"
              ? `Story exists; Source was not attached: ${attachment.error.message}`
              : "Story exists; Source attachment outcome is unavailable. No rollback or automatic replay was attempted.",
          retryAttachment: { relevance: sourceContribution, reason: decisionReason },
        });
        return;
      }
      onStoryKnown(story, 1);
      setProgress({ kind: "pending", stage: "Recording final triage decision…" });
      const triage = await inboxRequests.recordTriageDecision(
        item.source.id,
        "new_story",
        story.id,
        decisionReason,
      );
      if (triage.kind !== "completed") {
        setProgress({
          kind: "partial",
          story,
          retryTriage: { decision: "new_story", sourceCount: 1, reason: decisionReason },
          message:
            triage.kind === "application-failure"
              ? `Story and attachment exist; final triage audit failed: ${triage.error.message}`
              : "Story and attachment exist; final triage audit outcome is unavailable. No rollback was attempted.",
        });
        return;
      }
      onDecisionCompleted();
      const inspection = await inspect(story, 1);
      if (inspection !== null)
        setProgress({
          kind: "completed",
          decision: "new_story",
          message: "Story created and Source attached.",
          inspection,
        });
    } finally {
      pendingRef.current = false;
    }
  }

  async function attachExisting(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current || !validate(["story"])) return;
    const selected = stories.find(({ story }) => story.id === storyIdentity);
    if (!selected) return;
    const finalContribution = contribution.trim() || DEFAULT_SOURCE_CONTRIBUTION;
    const decisionReason = `Added this Source to “${selected.story.title}” because: ${finalContribution}`;
    pendingRef.current = true;
    try {
      setProgress({ kind: "pending", stage: "Attaching Source…" });
      const attachment = await storyRequests.attachSource(
        selected.story.id,
        item.source.id,
        finalContribution,
      );
      if (attachment.kind !== "completed") {
        setProgress({
          kind: "failure",
          message:
            attachment.kind === "application-failure"
              ? `Source was not attached: ${attachment.error.message}`
              : "Source attachment outcome is unavailable; no automatic replay was attempted.",
        });
        return;
      }
      const knownSourceCount = selected.sourceCount + 1;
      onStoryKnown(selected.story, knownSourceCount);
      setProgress({ kind: "pending", stage: "Recording final triage decision…" });
      const triage = await inboxRequests.recordTriageDecision(
        item.source.id,
        "existing_story",
        selected.story.id,
        decisionReason,
      );
      if (triage.kind !== "completed") {
        setProgress({
          kind: "partial",
          story: selected.story,
          retryTriage: {
            decision: "existing_story",
            sourceCount: knownSourceCount,
            reason: decisionReason,
          },
          message:
            triage.kind === "application-failure"
              ? `Attachment exists; final triage audit failed: ${triage.error.message}`
              : "Attachment exists; final triage audit outcome is unavailable. No rollback was attempted.",
        });
        return;
      }
      onDecisionCompleted();
      const inspection = await inspect(selected.story, knownSourceCount);
      if (inspection !== null)
        setProgress({
          kind: "completed",
          decision: "existing_story",
          message: "Source attached to Story.",
          inspection,
        });
    } finally {
      pendingRef.current = false;
    }
  }

  async function recoverNewStoryAttachment() {
    if (
      pendingRef.current ||
      progress.kind !== "partial" ||
      !progress.story ||
      !progress.retryAttachment
    )
      return;
    pendingRef.current = true;
    const story = progress.story;
    const { relevance, reason } = progress.retryAttachment;
    setProgress({ kind: "pending", stage: "Checking whether the Source was attached…" });
    try {
      const inspected = await storyRequests.inspectStory(story.id);
      if (inspected.kind !== "completed") {
        setProgress({
          kind: "partial",
          story,
          retryAttachment: { relevance, reason },
          message: "The attachment status could not be checked. Check again before retrying.",
        });
        return;
      }
      const existing = inspected.value.sources.find(
        ({ source: attachedSource }) => attachedSource.id === item.source.id,
      );
      if (existing && existing.attachment.relevance !== relevance) {
        setProgress({
          kind: "partial",
          story,
          retryAttachment: { relevance, reason },
          message:
            "A different attachment for this Source is already recorded. Review the Story before continuing triage.",
        });
        return;
      }
      if (!existing) {
        const attached = await storyRequests.attachSource(story.id, item.source.id, relevance);
        if (attached.kind !== "completed") {
          setProgress({
            kind: "partial",
            story,
            retryAttachment: { relevance, reason },
            message:
              attached.kind === "application-failure"
                ? `The Source is not confirmed attached: ${attached.error.message}`
                : "The attachment outcome is still unavailable. Check its status before retrying.",
          });
          return;
        }
      }

      const decision = await inboxRequests.recordTriageDecision(
        item.source.id,
        "new_story",
        story.id,
        reason,
      );
      if (decision.kind !== "completed") {
        setProgress({
          kind: "partial",
          story,
          retryTriage: { decision: "new_story", sourceCount: 1, reason },
          message:
            decision.kind === "application-failure"
              ? `Story and attachment exist; final triage audit failed: ${decision.error.message}`
              : "Story and attachment exist; final triage audit outcome is unavailable. No rollback was attempted.",
        });
        return;
      }
      onDecisionCompleted();
      const finalInspection = await storyRequests.inspectStory(story.id);
      setProgress({
        kind: "completed",
        decision: "new_story",
        message: "Story created and Source attached.",
        ...(finalInspection.kind === "completed" ? { inspection: finalInspection.value } : {}),
      });
    } finally {
      pendingRef.current = false;
    }
  }

  async function skip(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setProgress({ kind: "pending", stage: "Recording skip decision…" });
    try {
      const reason = skipReason.trim() || TRIAGE_REASON.skip;
      const result = await inboxRequests.recordTriageDecision(item.source.id, "skip", null, reason);
      if (result.kind === "completed") {
        onDecisionCompleted();
        setProgress({
          kind: "completed",
          decision: "skip",
          message: "Skip decision recorded. This Source is no longer pending.",
        });
      } else
        setProgress({
          kind: "failure",
          message:
            result.kind === "application-failure"
              ? result.error.message
              : SOURCE_INBOX_UNAVAILABLE_MESSAGE,
          error: result.kind === "application-failure" ? result.error : undefined,
        });
    } finally {
      pendingRef.current = false;
    }
  }

  async function retryFinalTriage() {
    if (
      pendingRef.current ||
      progress.kind !== "partial" ||
      !progress.story ||
      !progress.retryTriage
    )
      return;
    pendingRef.current = true;
    const story = progress.story;
    const decision = progress.retryTriage.decision;
    const reason = progress.retryTriage.reason;
    const knownSourceCount = progress.retryTriage.sourceCount;
    setProgress({ kind: "pending", stage: "Retrying final triage decision…" });
    try {
      const result = await inboxRequests.recordTriageDecision(
        item.source.id,
        decision,
        story.id,
        reason,
      );
      if (result.kind !== "completed") {
        setProgress({
          kind: "partial",
          story,
          retryTriage: { decision, sourceCount: knownSourceCount, reason },
          message:
            result.kind === "application-failure"
              ? `The attachment still exists; final triage audit failed: ${result.error.message}`
              : "The attachment still exists; final triage audit outcome remains unavailable.",
        });
        return;
      }
      onDecisionCompleted();
      const inspection = await inspect(story, knownSourceCount);
      if (inspection !== null)
        setProgress({
          kind: "completed",
          decision,
          message:
            decision === "new_story"
              ? "Story created and Source attached."
              : "Source attached to Story.",
          inspection,
        });
    } finally {
      pendingRef.current = false;
    }
  }

  const pending = progress.kind === "pending";
  const lockedByDurableStory = progress.kind === "partial" && progress.story !== undefined;
  const field = (name: string) =>
    errors[name] ? (
      <p className={styles.fieldError} role="alert">
        {errors[name]}
      </p>
    ) : null;

  if (progress.kind === "completed")
    return (
      <article
        className={`${styles.persistedSource} ${styles.triageCompleted}`}
        ref={itemRef}
        tabIndex={-1}
        aria-labelledby={`triage-completed-${item.source.id}`}
      >
        <span className={styles.completionMark} aria-hidden="true">
          ✓
        </span>
        <div>
          <p className={styles.sectionKicker}>Decision completed</p>
          <h3 id={`triage-completed-${item.source.id}`}>{progress.message}</h3>
          {/* Name the Story the operator just decided on, not the publisher's page title. */}
          <p>
            {progress.inspection?.story.title ?? extractedTitle(item) ?? item.source.canonicalUrl}
          </p>
          <div className={styles.handoffActions}>
            {progress.inspection ? (
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => {
                  onResolved();
                  onStoryLoaded(progress.inspection as StoryInspection);
                }}
              >
                Open Story
              </button>
            ) : (
              <button type="button" className={styles.primaryAction} onClick={onResolved}>
                Continue triage
              </button>
            )}
          </div>
        </div>
      </article>
    );

  return (
    <article className={styles.persistedSource} ref={itemRef} tabIndex={-1}>
      <p className={styles.sectionKicker}>Pending Source</p>
      <h3>{extractedTitle(item) || item.source.canonicalUrl}</h3>
      <p>
        <a href={item.source.canonicalUrl} target="_blank" rel="noreferrer">
          {item.source.canonicalUrl}
        </a>
      </p>
      <details className={styles.extractionAudit}>
        <summary>Source facts</summary>
        <p>Submitted URL: {item.source.submittedUrl}</p>
        <p>Source ID: {item.source.id}</p>
        <p>Received: {item.source.receivedAt}</p>
      </details>
      <Evidence
        item={item}
        extractions={extractions}
        preparations={preparations}
        preparingExtractionId={preparingExtractionId}
        preparationMessage={preparationMessage}
        extracting={extracting}
        extractionMessage={extractionMessage}
        onPrepare={(extractionId) => void prepare(extractionId)}
        onRetryExtraction={() => void retryExtraction()}
      />
      <div className={styles.workspaceSwitch} role="group" aria-label="What would you like to do?">
        <button
          type="button"
          aria-pressed={action === "new"}
          disabled={lockedByDurableStory}
          onClick={() => open("new")}
        >
          Cover this
        </button>
        <button
          type="button"
          aria-pressed={action === "existing"}
          disabled={lockedByDurableStory}
          onClick={() => open("existing")}
        >
          Add to an existing Story
        </button>
        <button
          type="button"
          aria-pressed={action === "skip"}
          disabled={lockedByDurableStory}
          onClick={() => open("skip")}
        >
          Skip
        </button>
      </div>
      {action === "new" ? (
        <form className={styles.storyCreationForm} onSubmit={createNew} aria-busy={pending}>
          <label>
            Story title
            <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          </label>
          {field("title")}
          <label htmlFor="story-reader-value">Why does this matter to your readers?</label>
          <p className={styles.fieldPurpose}>
            A short answer helps the newsroom choose a useful angle. You can keep the starting
            suggestion and refine it later.
          </p>
          <div className={styles.suggestionRow}>
            <button
              className={styles.secondaryAction}
              type="button"
              onClick={() => setReaderValue(readerValueSuggestion(item, publicationBrief))}
            >
              Use a suggested question
            </button>
            <span>Review and edit it before covering.</span>
          </div>
          <textarea
            id="story-reader-value"
            value={readerValue}
            maxLength={MAXIMUM_STORY_PURPOSE_FIELD_CHARACTERS}
            onChange={(event) => setReaderValue(event.currentTarget.value)}
          />
          <label htmlFor="story-focus">
            Anything you want us to investigate or emphasize? <span>(optional)</span>
          </label>
          <textarea
            id="story-focus"
            value={focus}
            maxLength={MAXIMUM_STORY_PURPOSE_FIELD_CHARACTERS}
            onChange={(event) => setFocus(event.currentTarget.value)}
          />
          <button
            type="submit"
            disabled={pending || (progress.kind === "partial" && progress.story !== undefined)}
          >
            Cover this Source
          </button>
        </form>
      ) : null}
      {action === "existing" ? (
        <form className={styles.storyCreationForm} onSubmit={attachExisting} aria-busy={pending}>
          <label>
            Existing Story
            <select
              value={storyIdentity}
              onChange={(event) => setStoryIdentity(event.currentTarget.value)}
            >
              <option value="">Choose a Story</option>
              {stories.map(({ story, sourceCount }) => (
                <option key={story.id} value={story.id}>
                  {story.title} · {story.state} · {sourceCount} sources
                </option>
              ))}
            </select>
          </label>
          {field("story")}
          <label htmlFor="triage-contribution">What does this Source add to the Story?</label>
          <p className={styles.fieldPurpose}>
            This note stays with this Source&apos;s attachment. The existing Story purpose will not
            change.
          </p>
          <button
            className={styles.secondaryAction}
            type="button"
            onClick={() => setContribution(contributionSuggestion(item, publicationBrief))}
          >
            Suggest how this source could help
          </button>
          <textarea
            id="triage-contribution"
            value={contribution}
            onChange={(event) => setContribution(event.currentTarget.value)}
          />
          <button
            type="submit"
            disabled={pending || (progress.kind === "partial" && progress.story !== undefined)}
          >
            Add this Source
          </button>
        </form>
      ) : null}
      {action === "skip" ? (
        <form className={styles.storyCreationForm} onSubmit={skip} aria-busy={pending}>
          <label htmlFor="triage-skip-reason">
            Reason <span>(optional)</span>
          </label>
          <textarea
            id="triage-skip-reason"
            value={skipReason}
            onChange={(event) => setSkipReason(event.currentTarget.value)}
          />
          <button type="submit" disabled={pending}>
            Skip this Source
          </button>
        </form>
      ) : null}
      {progress.kind === "pending" ? (
        <p className={styles.pendingStatus} role="status">
          {progress.stage}
        </p>
      ) : null}
      {progress.kind === "failure" ? (
        <div className={styles.workflowFailure} role="alert">
          <h4>Action did not complete</h4>
          <p>{progress.message}</p>
          {progress.error ? <p>Error code: {progress.error.code}</p> : null}
        </div>
      ) : null}
      {progress.kind === "partial" ? (
        <div className={styles.workflowPartial} role="alert">
          <h4>Partial progress is durable</h4>
          <p>{progress.message}</p>
          {progress.story ? (
            <p>
              Story: {progress.story.title} ({progress.story.id})
            </p>
          ) : null}
          {progress.retryTriage ? (
            <button
              className={styles.storyCreationAction}
              type="button"
              onClick={() => void retryFinalTriage()}
            >
              Retry final triage decision
            </button>
          ) : null}
          {progress.retryAttachment ? (
            <button
              className={styles.storyCreationAction}
              type="button"
              onClick={() => void recoverNewStoryAttachment()}
            >
              Check and continue attachment
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function SourceInboxWorkspace({
  refreshVersion,
  focusedSourceId = null,
  stories,
  inboxRequests: suppliedInboxRequests,
  storyRequests: suppliedStoryRequests,
  onPendingCountChange,
  onStoryKnown,
  onStoryLoaded,
}: SourceInboxWorkspaceProps) {
  const clients = useNewsroomClients();
  const inboxRequests = suppliedInboxRequests ?? clients.sourceInbox;
  const storyRequests = suppliedStoryRequests ?? clients.stories;
  const [state, setState] = useState<InboxState>({ kind: "loading" });
  const [publicationBrief, setPublicationBrief] = useState<PublicationBrief | null>(null);
  const [locallyCompletedSourceIds, setLocallyCompletedSourceIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const result = await inboxRequests.listPendingSources();
    if (result.kind === "completed") setLocallyCompletedSourceIds(new Set());
    setState(
      result.kind === "completed"
        ? { kind: "loaded", refreshVersion, items: result.value }
        : { kind: "unavailable", refreshVersion },
    );
  }, [inboxRequests, refreshVersion]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await inboxRequests.listPendingSources();
      if (!active) return;
      if (result.kind === "completed") setLocallyCompletedSourceIds(new Set());
      setState(
        result.kind === "completed"
          ? { kind: "loaded", refreshVersion, items: result.value }
          : { kind: "unavailable", refreshVersion },
      );
    })();
    return () => {
      active = false;
    };
  }, [refreshVersion, inboxRequests]);

  useEffect(() => {
    let active = true;
    void clients.newsroomStandards
      .listRevisions()
      .then((result) => {
        if (!active || result.kind !== "loaded") return;
        setPublicationBrief(result.revisions.at(-1)?.brief ?? null);
      })
      .catch(() => {
        if (active) setPublicationBrief(null);
      });
    return () => {
      active = false;
    };
  }, [clients.newsroomStandards]);

  const displayedState =
    state.kind !== "loading" && state.refreshVersion !== refreshVersion
      ? ({ kind: "loading" } as const)
      : state;
  const pendingCount =
    state.kind === "loaded" && state.refreshVersion === refreshVersion
      ? state.items.filter(({ source }) => !locallyCompletedSourceIds.has(source.id)).length
      : null;

  useEffect(() => {
    onPendingCountChange?.(pendingCount);
  }, [onPendingCountChange, pendingCount]);

  if (displayedState.kind === "loading")
    return (
      <section className={styles.emptyWorkspace} role="status">
        <p className={styles.sectionKicker}>Source Inbox</p>
        <h2>Loading pending Sources…</h2>
      </section>
    );
  if (displayedState.kind === "unavailable")
    return (
      <section className={styles.emptyWorkspace} role="alert">
        <p className={styles.sectionKicker}>Source Inbox</p>
        <h2>Source Inbox unavailable</h2>
        <p>{SOURCE_INBOX_UNAVAILABLE_MESSAGE}</p>
        <button type="button" className={styles.storyCreationAction} onClick={() => void load()}>
          Retry
        </button>
      </section>
    );

  return (
    <section className={styles.sourceWorkspace} aria-labelledby="source-inbox-title">
      <header className={styles.sourceWorkspaceHeader}>
        <p className={styles.sectionKicker}>Source Inbox</p>
        <h1 id="source-inbox-title">What would you like to cover?</h1>
        <p>Cover a source, add it to a story, or skip it. Your evidence stays available.</p>
      </header>
      {displayedState.items.length === 0 ? (
        <div className={styles.emptyWorkspace} role="status">
          <h2>No Sources await triage</h2>
          <p>The pending inbox is clear.</p>
        </div>
      ) : (
        [...displayedState.items]
          .sort((left, right) =>
            left.source.id === focusedSourceId ? -1 : right.source.id === focusedSourceId ? 1 : 0,
          )
          .map((item) => (
            <TriageItem
              key={`${displayedState.refreshVersion}:${item.source.id}`}
              item={item}
              publicationBrief={publicationBrief}
              stories={stories}
              inboxRequests={inboxRequests}
              storyRequests={storyRequests}
              onResolved={() =>
                setState((current) =>
                  current.kind === "loaded"
                    ? {
                        ...current,
                        items: current.items.filter(({ source }) => source.id !== item.source.id),
                      }
                    : current,
                )
              }
              onDecisionCompleted={() =>
                setLocallyCompletedSourceIds((current) => {
                  const next = new Set(current);
                  next.add(item.source.id);
                  return next;
                })
              }
              onStoryKnown={onStoryKnown}
              onStoryLoaded={onStoryLoaded}
              focusRequested={item.source.id === focusedSourceId}
            />
          ))
      )}
    </section>
  );
}
