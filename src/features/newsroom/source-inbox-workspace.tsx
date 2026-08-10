"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import type { SourceInboxItem } from "@/application/source-inbox";
import type { StoryInspection } from "@/application/story-inspection";
import type { StoryListItem } from "@/application/story-listing";
import type { Story } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import {
  sourceInboxClient,
  SOURCE_INBOX_UNAVAILABLE_MESSAGE,
  type SourceInboxClient,
  type SourceInboxClientError,
} from "./source-inbox-client";
import { storyClient, type StoryClient, type StoryClientApplicationError } from "./story-client";

type InboxState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded";
      readonly refreshVersion: number;
      readonly items: readonly SourceInboxItem[];
    }
  | { readonly kind: "unavailable"; readonly refreshVersion: number };

export interface SourceInboxWorkspaceProps {
  readonly refreshVersion: number;
  readonly stories: readonly StoryListItem[];
  readonly inboxRequests?: SourceInboxClient;
  readonly storyRequests?: StoryClient;
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

function Evidence({ item }: Readonly<{ item: SourceInboxItem }>) {
  return (
    <div className={styles.persistedEvidence}>
      <h4>Evidence / extraction history</h4>
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
                <h6>Actual persisted Markdown</h6>
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
      readonly retryTriage?: { readonly decision: "new_story" | "existing_story" };
    };

function TriageItem({
  item,
  stories,
  inboxRequests,
  storyRequests,
  onResolved,
  onStoryKnown,
  onStoryLoaded,
}: Readonly<{
  item: SourceInboxItem;
  stories: readonly StoryListItem[];
  inboxRequests: SourceInboxClient;
  storyRequests: StoryClient;
  onResolved: () => void;
  onStoryKnown: SourceInboxWorkspaceProps["onStoryKnown"];
  onStoryLoaded: SourceInboxWorkspaceProps["onStoryLoaded"];
}>) {
  const [action, setAction] = useState<Action>(null);
  const [title, setTitle] = useState(extractedTitle(item));
  const [storyIdentity, setStoryIdentity] = useState<string>(stories[0]?.story.id ?? "");
  const [relevance, setRelevance] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Progress>({ kind: "idle" });
  const pendingRef = useRef(false);

  function open(next: Exclude<Action, null>) {
    if (progress.kind === "partial" && progress.story !== undefined) return;
    setAction(next);
    setErrors({});
    setProgress({ kind: "idle" });
  }

  function validate(fields: readonly ("title" | "story" | "relevance" | "reason")[]): boolean {
    const values = { title, story: storyIdentity, relevance, reason };
    const messages = {
      title: "Enter a non-empty Story title.",
      story: "Choose an existing Story.",
      relevance: "Explain why this Source is relevant.",
      reason: "Enter a non-empty editorial decision reason.",
    };
    const next: Record<string, string> = {};
    for (const field of fields)
      if (values[field].trim().length === 0) next[field] = messages[field];
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function inspect(story: Story): Promise<boolean> {
    setProgress({ kind: "pending", stage: "Loading authoritative Story…" });
    const result = await storyRequests.inspectStory(story.id);
    if (result.kind === "completed") {
      onStoryLoaded(result.value);
      return true;
    } else {
      onStoryKnown(story, 1);
      setProgress({
        kind: "partial",
        story,
        message: "Triage is durable, but the authoritative Story inspection could not be loaded.",
      });
      return false;
    }
  }

  async function createNew(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current || !validate(["title", "relevance", "reason"])) return;
    pendingRef.current = true;
    try {
      setProgress({ kind: "pending", stage: "Creating Story…" });
      const creation = await storyRequests.createStory(title);
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
      const attachment = await storyRequests.attachSource(story.id, item.source.id, relevance);
      if (attachment.kind !== "completed") {
        setProgress({
          kind: "partial",
          story,
          message:
            attachment.kind === "application-failure"
              ? `Story exists; Source was not attached: ${attachment.error.message}`
              : "Story exists; Source attachment outcome is unavailable. No rollback or automatic replay was attempted.",
        });
        return;
      }
      onStoryKnown(story, 1);
      setProgress({ kind: "pending", stage: "Recording final triage decision…" });
      const triage = await inboxRequests.recordTriageDecision(
        item.source.id,
        "new_story",
        story.id,
        reason,
      );
      if (triage.kind !== "completed") {
        setProgress({
          kind: "partial",
          story,
          retryTriage: { decision: "new_story" },
          message:
            triage.kind === "application-failure"
              ? `Story and attachment exist; final triage audit failed: ${triage.error.message}`
              : "Story and attachment exist; final triage audit outcome is unavailable. No rollback was attempted.",
        });
        return;
      }
      if (await inspect(story)) onResolved();
    } finally {
      pendingRef.current = false;
    }
  }

  async function attachExisting(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current || !validate(["story", "relevance", "reason"])) return;
    const selected = stories.find(({ story }) => story.id === storyIdentity);
    if (!selected) return;
    pendingRef.current = true;
    try {
      setProgress({ kind: "pending", stage: "Attaching Source…" });
      const attachment = await storyRequests.attachSource(
        selected.story.id,
        item.source.id,
        relevance,
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
      onStoryKnown(selected.story, selected.sourceCount + 1);
      setProgress({ kind: "pending", stage: "Recording final triage decision…" });
      const triage = await inboxRequests.recordTriageDecision(
        item.source.id,
        "existing_story",
        selected.story.id,
        reason,
      );
      if (triage.kind !== "completed") {
        setProgress({
          kind: "partial",
          story: selected.story,
          retryTriage: { decision: "existing_story" },
          message:
            triage.kind === "application-failure"
              ? `Attachment exists; final triage audit failed: ${triage.error.message}`
              : "Attachment exists; final triage audit outcome is unavailable. No rollback was attempted.",
        });
        return;
      }
      if (await inspect(selected.story)) onResolved();
    } finally {
      pendingRef.current = false;
    }
  }

  async function skip(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current || !validate(["reason"])) return;
    pendingRef.current = true;
    setProgress({ kind: "pending", stage: "Recording skip decision…" });
    try {
      const result = await inboxRequests.recordTriageDecision(item.source.id, "skip", null, reason);
      if (result.kind === "completed") onResolved();
      else
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
          retryTriage: { decision },
          message:
            result.kind === "application-failure"
              ? `The attachment still exists; final triage audit failed: ${result.error.message}`
              : "The attachment still exists; final triage audit outcome remains unavailable.",
        });
        return;
      }
      if (await inspect(story)) onResolved();
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

  return (
    <article className={styles.persistedSource}>
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
      <Evidence item={item} />
      <div className={styles.workspaceSwitch} role="group" aria-label="Triage action">
        <button
          type="button"
          aria-pressed={action === "new"}
          disabled={lockedByDurableStory}
          onClick={() => open("new")}
        >
          Create new Story
        </button>
        <button
          type="button"
          aria-pressed={action === "existing"}
          disabled={lockedByDurableStory}
          onClick={() => open("existing")}
        >
          Attach to existing Story
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
          <label>
            Source relevance
            <textarea
              value={relevance}
              onChange={(event) => setRelevance(event.currentTarget.value)}
            />
          </label>
          {field("relevance")}
          <label>
            Editorial decision reason
            <textarea value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
          </label>
          {field("reason")}
          <button
            type="submit"
            disabled={pending || (progress.kind === "partial" && progress.story !== undefined)}
          >
            Create, attach, and record decision
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
          <label>
            Source relevance
            <textarea
              value={relevance}
              onChange={(event) => setRelevance(event.currentTarget.value)}
            />
          </label>
          {field("relevance")}
          <label>
            Editorial decision reason
            <textarea value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
          </label>
          {field("reason")}
          <button
            type="submit"
            disabled={pending || (progress.kind === "partial" && progress.story !== undefined)}
          >
            Attach and record decision
          </button>
        </form>
      ) : null}
      {action === "skip" ? (
        <form className={styles.storyCreationForm} onSubmit={skip} aria-busy={pending}>
          <label>
            Editorial decision reason
            <textarea value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
          </label>
          {field("reason")}
          <button type="submit" disabled={pending}>
            Record skip decision
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
        </div>
      ) : null}
    </article>
  );
}

export function SourceInboxWorkspace({
  refreshVersion,
  stories,
  inboxRequests = sourceInboxClient,
  storyRequests = storyClient,
  onStoryKnown,
  onStoryLoaded,
}: SourceInboxWorkspaceProps) {
  const [state, setState] = useState<InboxState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const result = await inboxRequests.listPendingSources();
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

  const displayedState =
    state.kind !== "loading" && state.refreshVersion !== refreshVersion
      ? ({ kind: "loading" } as const)
      : state;

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
        <h1 id="source-inbox-title">Decide what preserved evidence means</h1>
        <p>
          Source intake preserves evidence. Source Inbox makes the durable editorial decision: new
          Story, existing Story, or skip.
        </p>
      </header>
      {displayedState.items.length === 0 ? (
        <div className={styles.emptyWorkspace} role="status">
          <h2>No Sources await triage</h2>
          <p>The pending inbox is clear.</p>
        </div>
      ) : (
        displayedState.items.map((item) => (
          <TriageItem
            key={item.source.id}
            item={item}
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
            onStoryKnown={onStoryKnown}
            onStoryLoaded={onStoryLoaded}
          />
        ))
      )}
    </section>
  );
}
