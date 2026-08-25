"use client";

import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { StoryInspection } from "@/application/story-inspection";
import type { StoryListItem } from "@/application/story-listing";
import {
  STORY_STATES,
  type AgentProfile,
  type Site,
  type StoryId,
  type StoryState,
} from "@/domain/editorial";

import { AccountMenu } from "./account-menu";
import { applyTheme, readStoredTheme, type NewsroomThemeId } from "./theme";
import { ProfileWorkspace, SettingsWorkspace } from "./account-workspace";
import { AgentProfilesWorkspace } from "./agent-profiles-workspace";
import type { AgentProfileClient } from "./agent-profile-client";
import { useNewsroomClients, useNewsroomSite } from "./newsroom-clients";
import { STORY_STATE_LABELS } from "./newsroom-state";
import { NewsroomStaff, WRITER_DRAG_TYPE, type StaffState } from "./newsroom-staff";
import styles from "./newsroom-shell.module.css";
import { ResizableNewsroomLayout } from "./resizable-newsroom-layout";
import { SourceEvidenceWorkspace } from "./source-evidence-workspace";
import type { RequestSourceEvidenceUrl } from "./source-evidence-url-client";
import { SitesWorkspace } from "./sites-workspace";
import { SiteSwitcher } from "./site-switcher";
import { SourceInboxWorkspace } from "./source-inbox-workspace";
import type { SourceInboxClient } from "./source-inbox-client";
import { StoryWorkspace } from "./story-workspace";
import type { StoryClient } from "./story-client";

type WorkspaceMode =
  "story" | "source-inbox" | "source-intake" | "agents" | "sites" | "profile" | "settings";

export interface NewsroomShellProps {
  readonly requestSourceEvidence?: RequestSourceEvidenceUrl;
  readonly storyRequests?: StoryClient;
  readonly sourceInboxRequests?: SourceInboxClient;
  readonly agentProfileRequests?: AgentProfileClient;
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

function pluralizeStories(count: number): string {
  return `${count} ${count === 1 ? "story" : "stories"}`;
}

function pluralizeSources(count: number): string {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

export function NewsroomShell({
  requestSourceEvidence,
  storyRequests,
  sourceInboxRequests,
  agentProfileRequests,
}: NewsroomShellProps) {
  const newsroomSite = useNewsroomSite();
  const clients = useNewsroomClients();
  const requests = storyRequests ?? clients.stories;
  // Sites created in this session join the list without a reload, so the switcher tells the truth
  // the moment a second newsroom exists.
  const [createdSites, setCreatedSites] = useState<readonly Site[]>([]);
  // `undefined` means the operator has not chosen a queue, so the desk picks one for them.
  const [chosenQueue, setChosenQueue] = useState<StoryState | null | undefined>(undefined);
  const [listing, setListing] = useState<StoryListingState>({ kind: "loading" });
  const [storySelection, setStorySelection] = useState<StorySelection>({ kind: "none" });
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("story");
  const [sourceInboxRefreshVersion, setSourceInboxRefreshVersion] = useState(0);
  const [sourceInboxCount, setSourceInboxCount] = useState<number | null>(null);
  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffState>({ kind: "loading" });
  const [activeWriter, setActiveWriter] = useState<AgentProfile | null>(null);
  // The stored choice is only readable in the browser; on the server this resolves to the
  // default, which is also what the first paint uses.
  const [theme, setTheme] = useState<NewsroomThemeId>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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
    void requests
      .listStories()
      .then((result) => {
        if (active)
          setListing(
            result.kind === "completed"
              ? { kind: "loaded", items: result.value }
              : { kind: "unavailable" },
          );
      })
      .catch(() => {
        if (active) setListing({ kind: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [requests]);

  const loadStaff = useCallback(async () => {
    setStaff({ kind: "loading" });
    try {
      const result = await (agentProfileRequests ?? clients.agentProfiles).listProfiles();
      setStaff(
        result.kind === "completed"
          ? { kind: "loaded", profiles: result.value }
          : { kind: "unavailable" },
      );
    } catch {
      setStaff({ kind: "unavailable" });
    }
  }, [agentProfileRequests, clients]);

  useEffect(() => {
    let active = true;
    void (agentProfileRequests ?? clients.agentProfiles)
      .listProfiles()
      .then((result) => {
        if (!active) return;
        setStaff(
          result.kind === "completed"
            ? { kind: "loaded", profiles: result.value }
            : { kind: "unavailable" },
        );
      })
      .catch(() => {
        if (active) setStaff({ kind: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [agentProfileRequests, clients]);

  const items = listing.kind === "loaded" ? listing.items : [];
  const sites = useMemo(() => {
    const known = newsroomSite?.sites ?? [];
    return [...known, ...createdSites.filter((site) => !known.some(({ id }) => id === site.id))];
  }, [newsroomSite, createdSites]);

  // Open the desk where the work actually is. Stories furthest along need an operator decision
  // soonest, so the last non-empty queue wins until the operator picks one themselves.
  const suggestedQueue = useMemo(() => {
    const occupied = STORY_STATES.filter((state) =>
      items.some(({ story }) => story.state === state),
    );
    return occupied.at(-1) ?? "intake";
  }, [items]);
  const expandedQueue = chosenQueue === undefined ? suggestedQueue : chosenQueue;

  function openWorkspace(mode: WorkspaceMode) {
    setWorkspaceMode(mode);
    if (mode !== "story") setChosenQueue(null);
    if (mode !== "source-inbox") setFocusedSourceId(null);
  }

  function toggleQueue(state: StoryState) {
    setChosenQueue(expandedQueue === state ? null : state);
    setWorkspaceMode("story");
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

  function upsertStaffProfile(profile: AgentProfile) {
    setStaff((current) => {
      if (current.kind !== "loaded") return current;
      return {
        kind: "loaded",
        profiles: [...current.profiles.filter(({ id }) => id !== profile.id), profile],
      };
    });
  }

  return (
    <DragDropProvider
      onDragStart={(event) => {
        if (event.operation.source?.type !== WRITER_DRAG_TYPE) return;
        const profile: unknown = event.operation.source.data.profile;
        if (typeof profile === "object" && profile !== null)
          setActiveWriter(profile as AgentProfile);
      }}
      onDragEnd={() => setActiveWriter(null)}
    >
      <ResizableNewsroomLayout
        desk={
          <aside className={styles.desk} aria-label="The Desk">
            <header className={styles.identity}>
              <p className={styles.eyebrow}>Alpha preview</p>
              <div className={styles.deskLogoFrame}>
                <Image
                  className={styles.deskLogo}
                  src="/logo.png"
                  alt="StoryRail"
                  width={1795}
                  height={876}
                  preload
                />
              </div>
              {newsroomSite === null ? null : (
                <SiteSwitcher
                  site={newsroomSite.site}
                  sites={sites}
                  onCreateSite={() => openWorkspace("sites")}
                />
              )}
            </header>

            <nav className={styles.deskNavigation} aria-label="Newsroom navigation">
              <section aria-labelledby="sources-navigation-label">
                <p className={styles.navigationLabel} id="sources-navigation-label">
                  Sources
                </p>
                <button
                  type="button"
                  className={styles.addSourceAction}
                  aria-current={workspaceMode === "source-intake" ? "page" : undefined}
                  onClick={() => openWorkspace("source-intake")}
                >
                  <span className={styles.addSourceMark} aria-hidden="true">
                    +
                  </span>
                  <span>Add Source</span>
                </button>
                <button
                  type="button"
                  className={styles.navButton}
                  aria-label="Inbox"
                  aria-current={workspaceMode === "source-inbox" ? "page" : undefined}
                  onClick={() => openWorkspace("source-inbox")}
                >
                  <span>Inbox</span>
                  <span className={styles.queueCount}>{sourceInboxCount ?? "—"}</span>
                </button>
              </section>

              <section aria-labelledby="stories-navigation-label">
                <p className={styles.navigationLabel} id="stories-navigation-label">
                  Stories
                </p>
                <div className={styles.queueList}>
                  {STORY_STATES.map((state) => {
                    const queueStories = items.filter(({ story }) => story.state === state);
                    const count = queueStories.length;
                    const label = STORY_STATE_LABELS[state];
                    const expanded = workspaceMode === "story" && expandedQueue === state;
                    return (
                      <div className={styles.queueGroup} data-expanded={expanded} key={state}>
                        <button
                          className={styles.queueButton}
                          type="button"
                          aria-current={expanded ? "page" : undefined}
                          aria-expanded={expanded}
                          aria-label={
                            listing.kind === "loaded"
                              ? `${label}, ${pluralizeStories(count)}`
                              : `${label}, count unavailable`
                          }
                          onClick={() => toggleQueue(state)}
                        >
                          <span>{label}</span>
                          <span className={styles.queueCount}>
                            {listing.kind === "loaded" ? count : "—"}
                          </span>
                        </button>
                        {expanded && listing.kind === "loading" ? (
                          <p className={styles.queueInlineStatus} role="status">
                            Loading Stories…
                          </p>
                        ) : expanded && listing.kind === "unavailable" ? (
                          <div className={styles.queueInlineStatus} role="alert">
                            <span>Stories unavailable.</span>
                            <button type="button" onClick={() => void loadStories()}>
                              Retry
                            </button>
                          </div>
                        ) : expanded && queueStories.length > 0 ? (
                          <div className={styles.queueStories} aria-label={`${label} Stories`}>
                            {queueStories.map(({ story, sourceCount }) => {
                              const selected =
                                storySelection.kind === "loaded" &&
                                storySelection.inspection.story.id === story.id;
                              return (
                                <button
                                  className={styles.storyCard}
                                  type="button"
                                  key={story.id}
                                  aria-pressed={selected}
                                  aria-label={`${story.title}, ${STORY_STATE_LABELS[story.state]}, ${pluralizeSources(sourceCount)}`}
                                  onClick={() => void selectStory(story.id)}
                                >
                                  <span className={styles.storyCardTitle}>{story.title}</span>
                                  <span className={styles.storyCardMeta}>
                                    {STORY_STATE_LABELS[story.state]} ·{" "}
                                    {pluralizeSources(sourceCount)}
                                  </span>
                                  {selected ? (
                                    <span className={styles.storyCardSelection}>Selected</span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="people-navigation-label">
                <p className={styles.navigationLabel} id="people-navigation-label">
                  People
                </p>
                <button
                  type="button"
                  className={styles.navButton}
                  aria-current={workspaceMode === "agents" ? "page" : undefined}
                  onClick={() => openWorkspace("agents")}
                >
                  <span>Agents</span>
                  <span aria-hidden="true">→</span>
                </button>
              </section>

              <NewsroomStaff
                state={staff}
                onRetry={() => void loadStaff()}
                onOpenAgents={() => openWorkspace("agents")}
              />
            </nav>
          </aside>
        }

        workspace={
          <main className={styles.workspace}>
            <div className={styles.workspaceNavigation}>
              <p className={styles.workspaceBreadcrumb}>
                {workspaceMode === "profile" || workspaceMode === "settings"
                  ? "Account"
                  : "Newsroom"}
              </p>
              <AccountMenu
                activeItem={
                  workspaceMode === "profile" || workspaceMode === "settings"
                    ? workspaceMode
                    : undefined
                }
                onOpenProfile={() => openWorkspace("profile")}
                onOpenSettings={() => openWorkspace("settings")}
              />
            </div>
            <div hidden={workspaceMode !== "story"}>
              {storySelection.kind === "loaded" ? (
                <StoryWorkspace
                  key={storySelection.inspection.story.id}
                  inspection={storySelection.inspection}
                  notice={storySelection.notice}
                  requests={requests}
                  staff={staff}
                  onAssigned={async (facts, writerProfile) => {
                    const returnedInspection: StoryInspection = {
                      ...storySelection.inspection,
                      story: facts.story,
                      assignment: { assignment: facts.assignment, writerProfile },
                      transitions: [
                        ...storySelection.inspection.transitions,
                        facts.transitionReceipt,
                      ],
                    };
                    upsertStoryListItem({
                      story: facts.story,
                      sourceCount: storySelection.inspection.sources.length,
                    });
                    setChosenQueue("assigned");
                    setStorySelection({ kind: "loaded", inspection: returnedInspection });
                    try {
                      const refreshed = await requests.inspectStory(facts.story.id);
                      setStorySelection(
                        refreshed.kind === "completed"
                          ? { kind: "loaded", inspection: refreshed.value }
                          : {
                              kind: "loaded",
                              inspection: returnedInspection,
                              notice:
                                "Assignment saved. Authoritative inspection refresh is unavailable; reopen this Story to retry.",
                            },
                      );
                    } catch {
                      setStorySelection({
                        kind: "loaded",
                        inspection: returnedInspection,
                        notice:
                          "Assignment saved. Authoritative inspection refresh is unavailable; reopen this Story to retry.",
                      });
                    }
                  }}
                  onWriterCompleted={(refreshed) => {
                    upsertStoryListItem({
                      story: refreshed.story,
                      sourceCount: refreshed.sources.length,
                    });
                    setChosenQueue("in_progress");
                    setStorySelection({ kind: "loaded", inspection: refreshed });
                  }}
                  onReviewStateChanged={(refreshed) => {
                    upsertStoryListItem({
                      story: refreshed.story,
                      sourceCount: refreshed.sources.length,
                    });
                    setChosenQueue(refreshed.story.state);
                    setStorySelection({ kind: "loaded", inspection: refreshed });
                  }}
                />
              ) : storySelection.kind === "loading" ? (
                <section className={styles.emptyWorkspace} role="status">
                  <p className={styles.sectionKicker}>Story workspace</p>
                  <h2>Loading Story…</h2>
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
                  <p className={styles.sectionKicker}>Newsroom workbench</p>
                  <h2 id="empty-workspace-title">Choose a Story from the Desk</h2>
                  <p>
                    The active workspace will follow its editorial state and keep the next
                    meaningful action in view.
                  </p>
                </section>
              )}
            </div>

            <div hidden={workspaceMode !== "source-inbox"}>
              <SourceInboxWorkspace
                refreshVersion={sourceInboxRefreshVersion}
                focusedSourceId={focusedSourceId}
                stories={items}
                inboxRequests={sourceInboxRequests}
                storyRequests={requests}
                onPendingCountChange={setSourceInboxCount}
                onStoryKnown={(story, sourceCount) => {
                  upsertStoryListItem({ story, sourceCount });
                  setChosenQueue(story.state);
                }}
                onStoryLoaded={(inspection) => {
                  upsertStoryListItem({
                    story: inspection.story,
                    sourceCount: inspection.sources.length,
                  });
                  setChosenQueue(inspection.story.state);
                  setStorySelection({ kind: "loaded", inspection });
                  setWorkspaceMode("story");
                }}
              />
            </div>
            <div hidden={workspaceMode !== "source-intake"}>
              {workspaceMode === "source-intake" ? (
                <SourceEvidenceWorkspace
                  requestSourceEvidence={requestSourceEvidence}
                  inboxRequests={sourceInboxRequests}
                  onSourceAvailable={() => setSourceInboxRefreshVersion((current) => current + 1)}
                  onReviewInInbox={(sourceId) => {
                    setFocusedSourceId(sourceId);
                    setWorkspaceMode("source-inbox");
                  }}
                />
              ) : null}
            </div>
            <div hidden={workspaceMode !== "profile"}>
              {workspaceMode === "profile" ? <ProfileWorkspace /> : null}
            </div>
            <div hidden={workspaceMode !== "settings"}>
              {workspaceMode === "settings" ? (
                <SettingsWorkspace theme={theme} onThemeChange={setTheme} />
              ) : null}
            </div>
            <div hidden={workspaceMode !== "sites"}>
              {workspaceMode === "sites" && newsroomSite !== null ? (
                <SitesWorkspace
                  sites={sites}
                  currentSiteId={newsroomSite.site.id}
                  onSiteCreated={(site) =>
                    setCreatedSites((current) =>
                      current.some(({ id }) => id === site.id) ? current : [...current, site],
                    )
                  }
                />
              ) : null}
            </div>
            <div hidden={workspaceMode !== "agents"}>
              {workspaceMode === "agents" ? (
                <AgentProfilesWorkspace
                  requests={agentProfileRequests}
                  onProfileCreated={upsertStaffProfile}
                />
              ) : null}
            </div>
          </main>
        }
      />
      <DragOverlay className={styles.writerDragOverlay}>
        {activeWriter ? (
          <div>
            <span aria-hidden="true">⠿</span>
            <strong>{activeWriter.name}</strong>
            <small>Writer</small>
          </div>
        ) : null}
      </DragOverlay>
    </DragDropProvider>
  );
}
