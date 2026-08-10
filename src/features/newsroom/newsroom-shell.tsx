"use client";

import { useCallback, useEffect, useState } from "react";

import type { StoryInspection } from "@/application/story-inspection";
import type { StoryListItem } from "@/application/story-listing";
import {
  STORY_STATES,
  type EditorialActor,
  type SourceExtraction,
  type StoryId,
  type StoryState,
} from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import { STORY_STATE_LABELS } from "./newsroom-state";
import { SourceEvidenceWorkspace } from "./source-evidence-workspace";
import type { RequestSourceEvidenceUrl } from "./source-evidence-url-client";
import { storyClient, type StoryClient } from "./story-client";

type WorkspaceMode = "story" | "source-intake" | "assistant";

export interface NewsroomShellProps {
  readonly requestSourceEvidence?: RequestSourceEvidenceUrl;
  readonly storyRequests?: StoryClient;
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
          <h6>Actual persisted Markdown</h6>
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

function PersistedStoryWorkspace({ inspection }: Readonly<{ inspection: StoryInspection }>) {
  const { story, sources } = inspection;
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
      <div className={styles.timestamps}>
        <p>
          Created <time dateTime={story.createdAt}>{story.createdAt}</time>
        </p>
        <p>
          Updated <time dateTime={story.updatedAt}>{story.updatedAt}</time>
        </p>
      </div>
      <p className={styles.auditFact}>Story ID: {story.id}</p>

      <div className={styles.persistedSources}>
        <p className={styles.sectionNumber}>01</p>
        <h3>Attached Sources</h3>
        {sources.map(({ attachment, source, extractions }) => {
          const canonicalHref = safeUrl(source.canonicalUrl);
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
              <dl className={styles.receiptFacts}>
                <div>
                  <dt>Submitted URL</dt>
                  <dd>{source.submittedUrl}</dd>
                </div>
                <div>
                  <dt>Relevance</dt>
                  <dd>{attachment.relevance}</dd>
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
              <div className={styles.persistedEvidence}>
                <h5>Evidence / extraction history</h5>
                {extractions.length === 0 ? (
                  <p className={styles.noExtraction}>No extraction is recorded for this Source.</p>
                ) : (
                  extractions.map((extraction, index) => (
                    <PersistedExtractionAttempt
                      extraction={extraction}
                      attemptNumber={index + 1}
                      key={extraction.id}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className={styles.workspaceSections}>
        <section aria-labelledby="assignment-heading">
          <p className={styles.sectionNumber}>02</p>
          <h3 id="assignment-heading">Assignment</h3>
          <p>Assignments are not connected to persisted Story views yet.</p>
        </section>
        <section aria-labelledby="activity-heading">
          <p className={styles.sectionNumber}>03</p>
          <h3 id="activity-heading">Activity</h3>
          <p>Durable Story activity is not connected to this workspace yet.</p>
        </section>
      </div>
    </article>
  );
}

function AssistantWorkspace() {
  return (
    <section className={styles.assistantWorkspace} aria-labelledby="assistant-workspace-title">
      <p className={styles.sectionKicker}>Assistant workspace</p>
      <span className={styles.disconnectedStatus}>Not connected yet</span>
      <h2 id="assistant-workspace-title">Agent activity will appear here</h2>
      <p>
        A later batch will connect bounded agent runs and their receipts. This preview has no model
        responses or message composer.
      </p>
    </section>
  );
}

type StoryListingState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly items: readonly StoryListItem[] }
  | { readonly kind: "unavailable" };

type StorySelection =
  | { readonly kind: "none" }
  | { readonly kind: "loading"; readonly storyId: StoryId }
  | { readonly kind: "loaded"; readonly inspection: StoryInspection }
  | { readonly kind: "unavailable"; readonly storyId: StoryId };

export function NewsroomShell({ requestSourceEvidence, storyRequests }: NewsroomShellProps) {
  const requests = storyRequests ?? storyClient;
  const [selectedQueue, setSelectedQueue] = useState<StoryState>("intake");
  const [listing, setListing] = useState<StoryListingState>({ kind: "loading" });
  const [storySelection, setStorySelection] = useState<StorySelection>({ kind: "none" });
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("story");

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
              aria-pressed={workspaceMode === "source-intake"}
              onClick={() => setWorkspaceMode("source-intake")}
            >
              Source intake
            </button>
            <button
              type="button"
              aria-pressed={workspaceMode === "assistant"}
              onClick={() => setWorkspaceMode("assistant")}
            >
              Assistant
            </button>
          </div>
        </header>

        <div hidden={workspaceMode !== "story"}>
          {storySelection.kind === "loaded" ? (
            <PersistedStoryWorkspace inspection={storySelection.inspection} />
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
        <div hidden={workspaceMode !== "source-intake"}>
          <SourceEvidenceWorkspace
            requestSourceEvidence={requestSourceEvidence}
            storyRequests={requests}
            onStoryCreated={(story) => {
              upsertStoryListItem({ story, sourceCount: 0 });
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
        <div hidden={workspaceMode !== "assistant"}>
          <AssistantWorkspace />
        </div>
      </main>
    </div>
  );
}
