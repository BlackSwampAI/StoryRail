"use client";

import { useState } from "react";

import type { StoryInspection } from "@/application/story-inspection";
import type { EditorialActor, StoryId, StoryState } from "@/domain/editorial";

import {
  NEWSROOM_QUEUES,
  NEWSROOM_STORIES,
  STORY_STATE_LABELS,
  type NewsroomStoryFixture,
} from "./newsroom-fixtures";
import styles from "./newsroom-shell.module.css";
import { SourceEvidenceWorkspace } from "./source-evidence-workspace";
import type { RequestSourceEvidenceUrl } from "./source-evidence-url-client";
import type { StoryClient } from "./story-client";

type WorkspaceMode = "story" | "source-intake" | "assistant";

export interface NewsroomShellProps {
  readonly requestSourceEvidence?: RequestSourceEvidenceUrl;
  readonly storyRequests?: StoryClient;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function pluralizeStories(count: number): string {
  return `${count} ${count === 1 ? "story" : "stories"}`;
}

function pluralizeSources(count: number): string {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

function FixtureStoryWorkspace({ story }: Readonly<{ story: NewsroomStoryFixture | undefined }>) {
  if (!story) {
    return (
      <section className={styles.emptyWorkspace} aria-labelledby="empty-workspace-title">
        <p className={styles.sectionKicker}>Story workspace</p>
        <h2 id="empty-workspace-title">No Story selected</h2>
        <p>This queue is empty. Choose another queue to inspect its editorial Stories.</p>
      </section>
    );
  }

  return (
    <article className={styles.storyWorkspace} aria-labelledby="workspace-story-title">
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.sectionKicker}>Selected Story</p>
          <h2 id="workspace-story-title">{story.title}</h2>
        </div>
        <span className={styles.stateBadge}>{STORY_STATE_LABELS[story.state]}</span>
      </header>

      <p className={styles.summary}>{story.summary}</p>

      <dl className={styles.storyFacts}>
        <div>
          <dt>Revision cycle</dt>
          <dd>{story.revisionCycle}</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{story.sourceCount}</dd>
        </div>
        <div>
          <dt>Assigned role</dt>
          <dd>{story.assignedRole}</dd>
        </div>
      </dl>

      <div className={styles.timestamps}>
        <p>
          Created <time dateTime={story.createdAt}>{formatDate(story.createdAt)}</time>
        </p>
        <p>
          Updated <time dateTime={story.updatedAt}>{formatDate(story.updatedAt)}</time>
        </p>
      </div>

      <div className={styles.workspaceSections}>
        <section aria-labelledby="sources-heading">
          <p className={styles.sectionNumber}>01</p>
          <h3 id="sources-heading">Sources</h3>
          <p>
            {pluralizeSources(story.sourceCount)} noted for this Story. Source records and
            provenance will appear here in a later batch.
          </p>
        </section>
        <section aria-labelledby="assignment-heading">
          <p className={styles.sectionNumber}>02</p>
          <h3 id="assignment-heading">Assignment</h3>
          <p>
            Current desk role: {story.assignedRole}. A durable assignment brief has not been
            connected to this presentation prototype.
          </p>
        </section>
        <section aria-labelledby="activity-heading">
          <p className={styles.sectionNumber}>03</p>
          <h3 id="activity-heading">Activity</h3>
          <p>{story.lastActivity}</p>
          <p className={styles.placeholderNote}>
            Durable receipts and agent-run history are deferred.
          </p>
        </section>
      </div>
    </article>
  );
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
          Created <time dateTime={story.createdAt}>{formatDate(story.createdAt)}</time>
        </p>
        <p>
          Updated <time dateTime={story.updatedAt}>{formatDate(story.updatedAt)}</time>
        </p>
      </div>
      <p className={styles.auditFact}>Story ID: {story.id}</p>

      <div className={styles.persistedSources}>
        <p className={styles.sectionNumber}>01</p>
        <h3>Attached Sources</h3>
        {sources.map(({ attachment, source }) => {
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
                    <time dateTime={source.receivedAt}>{formatDate(source.receivedAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt>Attachment provenance</dt>
                  <dd>{actorLabel(attachment.attachedBy)}</dd>
                </div>
                <div>
                  <dt>Attached</dt>
                  <dd>
                    <time dateTime={attachment.attachedAt}>
                      {formatDate(attachment.attachedAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Source ID</dt>
                  <dd>{source.id}</dd>
                </div>
              </dl>
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

type StorySelection =
  | { readonly kind: "fixture"; readonly storyId: StoryId | undefined }
  | { readonly kind: "persisted"; readonly inspection: StoryInspection };

export function NewsroomShell({ requestSourceEvidence, storyRequests }: NewsroomShellProps) {
  const [selectedQueue, setSelectedQueue] = useState<StoryState>("intake");
  const initialStory = NEWSROOM_STORIES.find((story) => story.state === "intake");
  const [storySelection, setStorySelection] = useState<StorySelection>({
    kind: "fixture",
    storyId: initialStory?.id,
  });
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("story");

  const visibleStories = NEWSROOM_STORIES.filter((story) => story.state === selectedQueue);
  const selectedStory =
    storySelection.kind === "fixture"
      ? NEWSROOM_STORIES.find((story) => story.id === storySelection.storyId)
      : undefined;

  function selectQueue(state: StoryState) {
    const firstStory = NEWSROOM_STORIES.find((story) => story.state === state);

    setSelectedQueue(state);
    setStorySelection({ kind: "fixture", storyId: firstStory?.id });
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
          <p className={styles.navigationLabel}>Preview queues · fixture data</p>
          <div className={styles.queueList}>
            {NEWSROOM_QUEUES.map((queue) => (
              <button
                className={styles.queueButton}
                type="button"
                key={queue.state}
                aria-current={selectedQueue === queue.state ? "page" : undefined}
                aria-label={`${queue.label}, ${pluralizeStories(queue.count)}`}
                onClick={() => selectQueue(queue.state)}
              >
                <span>{queue.label}</span>
                <span className={styles.queueCount}>{queue.count}</span>
              </button>
            ))}
          </div>
        </nav>

        <section className={styles.storyListSection} aria-labelledby="queue-stories-title">
          <div className={styles.storyListHeader}>
            <div>
              <p className={styles.navigationLabel}>On the desk</p>
              <h1 id="queue-stories-title">{STORY_STATE_LABELS[selectedQueue]} Stories</h1>
            </div>
            <span>{visibleStories.length}</span>
          </div>

          {visibleStories.length > 0 ? (
            <div className={styles.storyList}>
              {visibleStories.map((story) => (
                <button
                  className={styles.storyCard}
                  type="button"
                  key={story.id}
                  aria-pressed={
                    storySelection.kind === "fixture" && storySelection.storyId === story.id
                  }
                  onClick={() => {
                    setStorySelection({ kind: "fixture", storyId: story.id });
                    setWorkspaceMode("story");
                  }}
                >
                  <span className={styles.storyCardTitle}>{story.title}</span>
                  <span className={styles.storyCardMeta}>
                    {pluralizeSources(story.sourceCount)}
                    <span aria-hidden="true"> · </span>
                    {story.assignedRole}
                  </span>
                  <span className={styles.storyCardActivity}>{story.lastActivity}</span>
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
          {storySelection.kind === "persisted" ? (
            <PersistedStoryWorkspace inspection={storySelection.inspection} />
          ) : (
            <FixtureStoryWorkspace story={selectedStory} />
          )}
        </div>
        <div hidden={workspaceMode !== "source-intake"}>
          <SourceEvidenceWorkspace
            requestSourceEvidence={requestSourceEvidence}
            storyRequests={storyRequests}
            onStoryLoaded={(inspection) => {
              setStorySelection({ kind: "persisted", inspection });
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
