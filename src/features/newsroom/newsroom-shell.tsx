"use client";

import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StoryInspection } from "@/application/story-inspection";
import type { StoryListItem } from "@/application/story-listing";
import {
  STORY_STATES,
  type AgentProfile,
  type PolicyRunId,
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
import { AUTOPILOT_FOLLOW_INTERVAL_MS, SourceEvidenceWorkspace } from "./source-evidence-workspace";
import type { RequestSourceEvidenceUrl } from "./source-evidence-url-client";
import { SitesWorkspace } from "./sites-workspace";
import { SiteSwitcher } from "./site-switcher";
import { CompactStoryRail } from "./story-rail";
import { FULL_RAIL_ELEMENT_ID, useFullRailOutOfView } from "./story-rail-visibility";
import { SourceInboxWorkspace } from "./source-inbox-workspace";
import type { SourceInboxClient } from "./source-inbox-client";
import { StoryWorkspace } from "./story-workspace";
import { NewsroomStandardsEditor } from "./newsroom-standards-editor";
import type { StoryClient } from "./story-client";

type WorkspaceMode =
  | "story"
  | "source-inbox"
  | "source-intake"
  | "agents"
  | "newsroom-brief"
  | "sites"
  | "profile"
  | "settings";

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

interface FollowedUrlAutopilot {
  readonly storyId: StoryId;
  readonly policyRunId: PolicyRunId;
}

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
  const storySelectionGeneration = useRef(0);
  const pendingAutopilotRailFocus = useRef<StoryId | null>(null);
  const followedUrlAutopilotRef = useRef<FollowedUrlAutopilot | null>(null);
  const [followedUrlAutopilot, setFollowedUrlAutopilot] = useState<FollowedUrlAutopilot | null>(
    null,
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("story");
  // Observed against the open Story, so opening another one starts watching that Story's rail
  // rather than an element that has since been replaced.
  const railOutOfView = useFullRailOutOfView(
    storySelection.kind === "loaded" ? storySelection.inspection.story.id : null,
  );
  useEffect(() => {
    if (
      workspaceMode !== "story" ||
      storySelection.kind !== "loaded" ||
      pendingAutopilotRailFocus.current !== storySelection.inspection.story.id
    ) {
      return;
    }
    const rail = document.getElementById(FULL_RAIL_ELEMENT_ID);
    if (!rail) return;
    pendingAutopilotRailFocus.current = null;
    rail.scrollIntoView?.({ block: "start" });
  }, [storySelection, workspaceMode]);
  const [sourceInboxRefreshVersion, setSourceInboxRefreshVersion] = useState(0);
  const [newsroomBriefConfigured, setNewsroomBriefConfigured] = useState<boolean | null>(null);
  const [sourceInboxCount, setSourceInboxCount] = useState<number | null>(null);
  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffState>({ kind: "loading" });
  const [activeWriter, setActiveWriter] = useState<AgentProfile | null>(null);
  // The stored choice is only readable in the browser; on the server this resolves to the
  // default, which is also what the first paint uses.
  const [theme, setTheme] = useState<NewsroomThemeId>(readStoredTheme);

  useEffect(() => {
    let active = true;
    void clients.newsroomStandards
      .listRevisions()
      .then((result) => {
        if (!active || result.kind !== "loaded") return;
        const brief = result.revisions.at(-1)?.brief;
        setNewsroomBriefConfigured(Boolean(brief?.audience.trim() && brief.readerBenefit.trim()));
      })
      .catch(() => {
        if (active) setNewsroomBriefConfigured(null);
      });
    return () => {
      active = false;
    };
  }, [clients.newsroomStandards]);

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

  const upsertStoryListItem = useCallback((item: StoryListItem) => {
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
  }, []);

  function openWorkspace(mode: WorkspaceMode) {
    followedUrlAutopilotRef.current = null;
    setFollowedUrlAutopilot(null);
    pendingAutopilotRailFocus.current = null;
    storySelectionGeneration.current += 1;
    setWorkspaceMode(mode);
    if (mode !== "story") setChosenQueue(null);
    if (mode !== "source-inbox") setFocusedSourceId(null);
  }

  function toggleQueue(state: StoryState) {
    followedUrlAutopilotRef.current = null;
    setFollowedUrlAutopilot(null);
    pendingAutopilotRailFocus.current = null;
    storySelectionGeneration.current += 1;
    setChosenQueue(expandedQueue === state ? null : state);
    setWorkspaceMode("story");
  }

  const selectStory = useCallback(
    async (identity: StoryId, openStoryQueue = false) => {
      if (!openStoryQueue && pendingAutopilotRailFocus.current !== identity) {
        followedUrlAutopilotRef.current = null;
        setFollowedUrlAutopilot(null);
        pendingAutopilotRailFocus.current = null;
      }
      const generation = ++storySelectionGeneration.current;
      const shouldOpenStoryQueue = openStoryQueue || pendingAutopilotRailFocus.current === identity;
      setStorySelection({ kind: "loading", storyId: identity });
      setWorkspaceMode("story");
      try {
        const result = await requests.inspectStory(identity);
        if (generation !== storySelectionGeneration.current) return;
        if (result.kind === "completed") {
          if (shouldOpenStoryQueue) {
            upsertStoryListItem({
              story: result.value.story,
              sourceCount: result.value.sources.length,
            });
            setChosenQueue(result.value.story.state);
          }
          setStorySelection({ kind: "loaded", inspection: result.value });
        } else {
          setStorySelection({ kind: "unavailable", storyId: identity });
        }
      } catch {
        if (generation !== storySelectionGeneration.current) return;
        setStorySelection({ kind: "unavailable", storyId: identity });
      }
    },
    [requests, upsertStoryListItem],
  );

  const handoffAutopilotStory = useCallback(
    (identity: StoryId, policyRunIdentity: PolicyRunId | null) => {
      pendingAutopilotRailFocus.current = identity;
      const follow =
        policyRunIdentity === null ? null : { storyId: identity, policyRunId: policyRunIdentity };
      followedUrlAutopilotRef.current = follow;
      setFollowedUrlAutopilot(follow);
      void selectStory(identity, true);
    },
    [selectStory],
  );

  const followedStoryReady =
    followedUrlAutopilot !== null &&
    storySelection.kind === "loaded" &&
    storySelection.inspection.story.id === followedUrlAutopilot.storyId;
  useEffect(() => {
    if (followedUrlAutopilot === null || !followedStoryReady) return;
    let active = true;
    let checking = false;

    const observe = async () => {
      if (checking || followedUrlAutopilotRef.current !== followedUrlAutopilot) {
        return;
      }
      checking = true;
      const selectionGeneration = storySelectionGeneration.current;
      try {
        const followed = await clients.urlAutopilot.follow(followedUrlAutopilot.policyRunId);
        if (
          !active ||
          followedUrlAutopilotRef.current !== followedUrlAutopilot ||
          storySelectionGeneration.current !== selectionGeneration ||
          followed.kind !== "observed" ||
          followed.run.storyId !== followedUrlAutopilot.storyId
        ) {
          return;
        }
        const inspected = await requests.inspectStory(followedUrlAutopilot.storyId);
        if (
          !active ||
          followedUrlAutopilotRef.current !== followedUrlAutopilot ||
          storySelectionGeneration.current !== selectionGeneration ||
          inspected.kind !== "completed"
        ) {
          return;
        }

        upsertStoryListItem({
          story: inspected.value.story,
          sourceCount: inspected.value.sources.length,
        });
        setChosenQueue(inspected.value.story.state);
        storySelectionGeneration.current += 1;
        setStorySelection({ kind: "loaded", inspection: inspected.value });
        if (followed.run.status === "settled") {
          followedUrlAutopilotRef.current = null;
          setFollowedUrlAutopilot(null);
        }
      } catch {
        // Keep following. A transient read failure does not mean the durable run has stopped.
      } finally {
        checking = false;
      }
    };

    void observe();
    const timer = setInterval(() => void observe(), AUTOPILOT_FOLLOW_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [
    clients.urlAutopilot,
    followedStoryReady,
    followedUrlAutopilot,
    requests,
    upsertStoryListItem,
  ]);

  function installStoryInspection(inspection: StoryInspection, notice?: string) {
    storySelectionGeneration.current += 1;
    setStorySelection({ kind: "loaded", inspection, ...(notice === undefined ? {} : { notice }) });
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
                {/*
                 * A loading state that cannot become an error is a lie by omission: the desk sat
                 * on "Loading Stories…" and eight dashes with no way to tell a slow network from
                 * an empty newsroom from a broken page. The failure is said at the desk rather
                 * than inside a queue nobody has expanded.
                 */}
                {listing.kind === "loading" ? (
                  <p className={styles.deskListingStatus} role="status">
                    Loading Stories…
                  </p>
                ) : null}
                {listing.kind === "unavailable" ? (
                  <div className={styles.deskListingStatus} role="alert">
                    <span>Stories could not be loaded.</span>
                    <button type="button" onClick={() => void loadStories()}>
                      Retry
                    </button>
                  </div>
                ) : null}
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

              <section aria-labelledby="editorial-navigation-label">
                <p className={styles.navigationLabel} id="editorial-navigation-label">
                  Editorial setup
                </p>
                <button
                  type="button"
                  className={styles.navButton}
                  aria-current={workspaceMode === "newsroom-brief" ? "page" : undefined}
                  onClick={() => openWorkspace("newsroom-brief")}
                >
                  <span>Newsroom brief</span>
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
            {newsroomBriefConfigured === false &&
            workspaceMode !== "story" &&
            workspaceMode !== "newsroom-brief" ? (
              <aside className={styles.newsroomBriefCallout}>
                <div>
                  <strong>Set your newsroom brief</strong>
                  <p>Answer a few short questions about your readers and what they need.</p>
                </div>
                <button type="button" onClick={() => openWorkspace("newsroom-brief")}>
                  Set up newsroom brief
                </button>
              </aside>
            ) : null}
            <div className={styles.workspaceNavigation}>
              <div className={styles.workspaceNavigationLead}>
                <p className={styles.workspaceBreadcrumb}>
                  {workspaceMode === "profile" || workspaceMode === "settings"
                    ? "Account"
                    : "Newsroom"}
                </p>
                {/*
                 * The band is pinned, so the one thing worth spending its width on is where the
                 * open Story stands — and only once the full rail has scrolled behind the band,
                 * so this appears exactly when it is replacing something the reader has lost and
                 * the same answer is never on the screen twice.
                 */}
                {workspaceMode === "story" && storySelection.kind === "loaded" && railOutOfView ? (
                  <CompactStoryRail
                    state={storySelection.inspection.story.state}
                    delivered={storySelection.inspection.deliveries.some(
                      (delivery) => delivery.outcome === "succeeded",
                    )}
                    leftFrom={
                      [...storySelection.inspection.transitions]
                        .reverse()
                        .find((transition) => transition.nextState === "rejected")?.previousState
                    }
                  />
                ) : null}
              </div>
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
                  followingUrlAutopilot={
                    followedUrlAutopilot?.storyId === storySelection.inspection.story.id
                  }
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
                    installStoryInspection(returnedInspection);
                    const refreshGeneration = storySelectionGeneration.current;
                    try {
                      const refreshed = await requests.inspectStory(facts.story.id);
                      if (refreshGeneration !== storySelectionGeneration.current) return;
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
                      if (refreshGeneration !== storySelectionGeneration.current) return;
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
                    installStoryInspection(refreshed);
                  }}
                  onReviewStateChanged={(refreshed) => {
                    upsertStoryListItem({
                      story: refreshed.story,
                      sourceCount: refreshed.sources.length,
                    });
                    setChosenQueue(refreshed.story.state);
                    installStoryInspection(refreshed);
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
                  installStoryInspection(inspection);
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
                  onAutopilotStory={handoffAutopilotStory}
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
            <div hidden={workspaceMode !== "newsroom-brief"}>
              {workspaceMode === "newsroom-brief" ? (
                <NewsroomStandardsEditor onBriefSaved={() => setNewsroomBriefConfigured(true)} />
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
