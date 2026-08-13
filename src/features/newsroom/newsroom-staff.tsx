"use client";

import { useDraggable } from "@dnd-kit/react";

import type { AgentProfile } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";

export type StaffState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly profiles: readonly AgentProfile[] }
  | { readonly kind: "unavailable" };

export const WRITER_DRAG_TYPE = "writer-profile";
export const WRITER_ASSIGNMENT_DROP_ID = "intake-writer-assignment";

const BUILT_IN_ORDER = new Map([
  ["storyrail-assignment-editor-v1", 1],
  ["storyrail-general-writer-v1", 2],
  ["storyrail-director-v1", 3],
]);

function sortProfiles(profiles: readonly AgentProfile[]): readonly AgentProfile[] {
  return [...profiles].sort((left, right) => {
    const leftOrder = BUILT_IN_ORDER.get(left.id) ?? 4;
    const rightOrder = BUILT_IN_ORDER.get(right.id) ?? 4;
    return leftOrder - rightOrder || left.name.localeCompare(right.name);
  });
}

function roleLabel(profile: AgentProfile): string {
  if (profile.role === "assignment_editor") return "Assignment Editor";
  if (profile.role === "editor_in_chief") return "Director · Editor-in-Chief";
  return "Writer";
}

function modelSummary(profile: AgentProfile): string {
  return profile.model?.model ?? "Newsroom default";
}

function AgentProfileCard({
  profile,
  onOpenAgents,
}: Readonly<{ profile: AgentProfile; onOpenAgents: () => void }>) {
  const writer = profile.role === "writer";
  const { ref, handleRef, isDragging } = useDraggable({
    id: `writer-profile:${profile.id}`,
    type: WRITER_DRAG_TYPE,
    disabled: !writer,
    data: { profile },
  });

  return (
    <article
      ref={writer ? ref : undefined}
      className={styles.staffCard}
      data-dragging={isDragging || undefined}
    >
      <header className={styles.staffCardHeader}>
        {writer ? (
          <button
            ref={handleRef}
            type="button"
            className={styles.dragHandle}
            aria-label={`Drag ${profile.name} to an Assignment`}
            title={`Drag ${profile.name} to an Assignment`}
          >
            <span aria-hidden="true">⠿</span>
          </button>
        ) : (
          <span className={styles.staffRoleMark} aria-hidden="true">
            ◇
          </span>
        )}
        <div>
          <h3>{profile.name}</h3>
          <p>
            {roleLabel(profile)} · {profile.builtIn ? "Built in" : "Custom"}
          </p>
        </div>
      </header>
      <p className={styles.staffModel}>{modelSummary(profile)}</p>
      <details className={styles.staffDisclosure}>
        <summary>Profile details</summary>
        <dl>
          <div>
            <dt>Role</dt>
            <dd>{roleLabel(profile)}</dd>
          </div>
          <div>
            <dt>Configuration</dt>
            <dd>{profile.builtIn ? "Built-in snapshot" : "Custom snapshot"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>
              {profile.model
                ? `${profile.model.provider} / ${profile.model.model}`
                : "Newsroom default at execution"}
            </dd>
          </div>
          <div>
            <dt>Instructions</dt>
            <dd className={styles.staffInstructions}>{profile.instructions}</dd>
          </div>
          <div>
            <dt>Profile identity</dt>
            <dd className={styles.staffTechnical}>{profile.id}</dd>
          </div>
        </dl>
        <button type="button" className={styles.staffManageAction} onClick={onOpenAgents}>
          Open in Agents
        </button>
      </details>
    </article>
  );
}

export function NewsroomStaff({
  state,
  onRetry,
  onOpenAgents,
}: Readonly<{ state: StaffState; onRetry: () => void; onOpenAgents: () => void }>) {
  const writerCount =
    state.kind === "loaded"
      ? state.profiles.filter((profile) => profile.role === "writer").length
      : 0;
  return (
    <section className={styles.staffSection} aria-labelledby="newsroom-staff-label">
      <div className={styles.staffSectionHeading}>
        <p className={styles.navigationLabel} id="newsroom-staff-label">
          Newsroom Staff
        </p>
        {state.kind === "loaded" ? <span>{state.profiles.length}</span> : null}
      </div>
      {state.kind === "loading" ? (
        <p className={styles.staffStatus} role="status">
          Loading Staff…
        </p>
      ) : state.kind === "unavailable" ? (
        <div className={styles.staffStatus} role="alert">
          <span>Staff unavailable.</span>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : state.profiles.length === 0 ? (
        <p className={styles.staffStatus}>No Agent Profiles are available.</p>
      ) : (
        <div className={styles.staffList}>
          {sortProfiles(state.profiles).map((profile) => (
            <AgentProfileCard key={profile.id} profile={profile} onOpenAgents={onOpenAgents} />
          ))}
          {writerCount === 0 ? (
            <p className={styles.staffStatus}>No Writer Profiles are available for Assignment.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
