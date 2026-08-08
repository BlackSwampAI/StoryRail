"use client";

import { useState } from "react";

import type { StoryId, StoryState } from "@/domain/editorial";

import {
  NEWSROOM_QUEUES,
  NEWSROOM_STORIES,
  STORY_STATE_LABELS,
  type NewsroomStoryFixture,
} from "./newsroom-fixtures";
import styles from "./newsroom-shell.module.css";

type WorkspaceMode = "story" | "assistant";

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

function StoryWorkspace({ story }: Readonly<{ story: NewsroomStoryFixture | undefined }>) {
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

export function NewsroomShell() {
  const [selectedQueue, setSelectedQueue] = useState<StoryState>("intake");
  const initialStory = NEWSROOM_STORIES.find((story) => story.state === "intake");
  const [selectedStoryId, setSelectedStoryId] = useState<StoryId | undefined>(initialStory?.id);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("story");

  const visibleStories = NEWSROOM_STORIES.filter((story) => story.state === selectedQueue);
  const selectedStory = NEWSROOM_STORIES.find((story) => story.id === selectedStoryId);

  function selectQueue(state: StoryState) {
    const firstStory = NEWSROOM_STORIES.find((story) => story.state === state);

    setSelectedQueue(state);
    setSelectedStoryId(firstStory?.id);
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
          <p className={styles.navigationLabel}>Queues</p>
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
                  aria-pressed={selectedStoryId === story.id}
                  onClick={() => setSelectedStoryId(story.id)}
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
              aria-pressed={workspaceMode === "assistant"}
              onClick={() => setWorkspaceMode("assistant")}
            >
              Assistant
            </button>
          </div>
        </header>

        {workspaceMode === "story" ? (
          <StoryWorkspace story={selectedStory} />
        ) : (
          <AssistantWorkspace />
        )}
      </main>
    </div>
  );
}
