"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { AgentProfile } from "@/domain/editorial";

import type { AgentProfileClient } from "./agent-profile-client";
import { useNewsroomClients } from "./newsroom-clients";
import { NewsroomStandardsEditor } from "./newsroom-standards-editor";
import styles from "./newsroom-shell.module.css";

type ProfileState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly profiles: readonly AgentProfile[] }
  | { readonly kind: "unavailable" };

const BUILT_IN_ORDER = new Map([
  ["storyrail-assignment-editor-v1", 1],
  ["storyrail-general-writer-v1", 2],
  ["storyrail-director-v1", 3],
]);

function sortProfiles(profiles: readonly AgentProfile[]): readonly AgentProfile[] {
  return [...profiles].sort((left, right) => {
    const leftOrder = BUILT_IN_ORDER.get(left.id) ?? 4;
    const rightOrder = BUILT_IN_ORDER.get(right.id) ?? 4;
    return (
      leftOrder - rightOrder ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id)
    );
  });
}

function roleLabel(profile: AgentProfile): string {
  if (profile.role === "assignment_editor") return "Assignment editor";
  if (profile.role === "editor_in_chief") return "Editor-in-chief";
  return "Writer";
}

export function AgentProfilesWorkspace({
  requests: suppliedRequests,
  onProfileCreated,
}: {
  readonly requests?: AgentProfileClient;
  readonly onProfileCreated?: (profile: AgentProfile) => void;
}) {
  const clients = useNewsroomClients();
  const requests = suppliedRequests ?? clients.agentProfiles;
  const [state, setState] = useState<ProfileState>({ kind: "loading" });
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  async function load() {
    setState({ kind: "loading" });
    try {
      const result = await requests.listProfiles();
      setState(
        result.kind === "completed"
          ? { kind: "loaded", profiles: result.value }
          : { kind: "unavailable" },
      );
    } catch {
      setState({ kind: "unavailable" });
    }
  }

  useEffect(() => {
    let active = true;
    void requests.listProfiles().then(
      (result) => {
        if (active) {
          setState(
            result.kind === "completed"
              ? { kind: "loaded", profiles: result.value }
              : { kind: "unavailable" },
          );
        }
      },
      () => {
        if (active) setState({ kind: "unavailable" });
      },
    );
    return () => {
      active = false;
    };
  }, [requests]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);
    const hasProvider = provider.trim().length > 0;
    const hasModel = model.trim().length > 0;
    if (hasProvider !== hasModel) {
      setFormMessage("Provider and Model identifier must both be supplied or both omitted.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await requests.createWriterProfile({
        name,
        instructions,
        model: hasProvider ? { provider, model } : null,
      });
      if (result.kind !== "completed") {
        setFormMessage(
          result.kind === "application-failure" ? result.error.message : result.message,
        );
        return;
      }
      setState((current) => {
        if (current.kind !== "loaded") return { kind: "loaded", profiles: [result.value] };
        return {
          kind: "loaded",
          profiles: sortProfiles([
            ...current.profiles.filter((profile) => profile.id !== result.value.id),
            result.value,
          ]),
        };
      });
      onProfileCreated?.(result.value);
      setName("");
      setInstructions("");
      setProvider("");
      setModel("");
      setFormMessage("Writer profile saved to PostgreSQL.");
    } catch {
      setFormMessage("The Agent Profile request could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.agentsWorkspace} aria-labelledby="agents-workspace-title">
      <header className={styles.agentsHeader}>
        <p className={styles.sectionKicker}>Durable configuration</p>
        <h2 id="agents-workspace-title">Agent Profiles</h2>
        <p>Agent Profiles configure the roles future Assignments and agent runs will use.</p>
        <span className={styles.disconnectedStatus}>No agents are running</span>
      </header>

      {state.kind === "loading" ? (
        <p role="status">Loading durable Agent Profiles…</p>
      ) : state.kind === "unavailable" ? (
        <div role="alert" className={styles.profileStatus}>
          <p>Agent Profiles are unavailable. No configuration has been inferred.</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : state.profiles.length === 0 ? (
        <p role="status">No durable Agent Profiles are configured.</p>
      ) : (
        <div className={styles.profileGrid}>
          {state.profiles.map((profile) => (
            <article className={styles.profileCard} key={profile.id}>
              <header>
                <div>
                  <p>{roleLabel(profile)}</p>
                  <h3>{profile.name}</h3>
                </div>
                <span>{profile.builtIn ? "Built-in" : "Custom"}</span>
              </header>
              <p>{profile.instructions}</p>
              <dl>
                <div>
                  <dt>Model</dt>
                  <dd>
                    {profile.model === null
                      ? "Newsroom default at execution"
                      : `${profile.model.provider} / ${profile.model.model}`}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
          <a className={styles.newWriterTile} href="#create-writer-profile">
            <span className={styles.newWriterTileMark} aria-hidden="true">
              +
            </span>
            <span>New Writer profile</span>
          </a>
        </div>
      )}

      <NewsroomStandardsEditor />

      <form
        className={styles.profileForm}
        id="create-writer-profile"
        tabIndex={-1}
        onSubmit={(event) => void submit(event)}
      >
        <h3>Create Writer profile</h3>
        <p>Create another immutable Writer configuration. Profiles cannot be edited or deleted.</p>
        <label htmlFor="profile-name">Name</label>
        <input
          id="profile-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={submitting}
        />
        <label htmlFor="profile-instructions">Instructions</label>
        <textarea
          id="profile-instructions"
          name="instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          disabled={submitting}
        />
        <div className={styles.profileModelFields}>
          <div>
            <label htmlFor="profile-provider">Provider (optional)</label>
            <input
              id="profile-provider"
              name="provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="profile-model">Model identifier (optional)</label>
            <input
              id="profile-model"
              name="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Create Writer profile"}
        </button>
        {formMessage === null ? null : <p role="status">{formMessage}</p>}
      </form>
    </section>
  );
}
