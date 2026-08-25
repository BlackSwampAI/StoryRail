"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  DEFAULT_DESTINATION_DRAFT,
  SITE_DESTINATION_KINDS,
  SITE_MODEL_ROLES,
  type CredentialSlot,
  type CredentialUnavailableError,
  type SiteDestinationKind,
  type SiteDestinationSettings,
  type SiteModelIds,
  type SiteModelRole,
} from "@/domain/editorial";

import {
  MODEL_CATALOG_PROVIDERS,
  type CatalogModel,
  type ModelCatalogProviderId,
} from "@/application/model-catalog";

import type { ScaffoldStoredConnector } from "./account-scaffold";
import { MODEL_CATALOG_UNAVAILABLE_MESSAGE, type ModelCatalogClient } from "./model-catalog-client";
import type { SiteSettingsClient, SiteSettingsClientResult } from "./site-settings-client";
import styles from "./newsroom-shell.module.css";

/**
 * What is known about a stored credential, which is deliberately never the credential.
 *
 * `updatedAt` is null immediately after a write because the write answers with the hint alone.
 * A row that has just been set says so without inventing a timestamp it was not given.
 */
export interface CredentialState {
  readonly hint: string;
  readonly updatedAt: string | null;
}

export const MODEL_ROLE_LABELS: Readonly<Record<SiteModelRole, string>> = {
  evidencePreparation: "Evidence preparation",
  assignmentEditor: "Assignment editor",
  writer: "Writer",
  director: "Director",
  researcher: "Researcher",
};

/**
 * The three named reasons a credential is unusable have three different remedies, so they get
 * three different sentences. Collapsing them would send an operator whose encryption key changed
 * to a settings screen to re-enter a key that was never the problem.
 */
export function credentialFailureMessage(error: CredentialUnavailableError): string {
  switch (error.reason) {
    case "CREDENTIAL_NOT_CONFIGURED":
      return `No key is stored for ${error.slot}. Enter one to enable it.`;
    case "CREDENTIAL_KEY_UNAVAILABLE":
      return "STORYRAIL_CREDENTIAL_KEY is not available to this deployment, so no credential can be read or written. Entering a key here will not help until it is set.";
    case "CREDENTIAL_UNREADABLE":
      return `The stored ${error.slot} cannot be read with the encryption key in use. Restore the key it was written with, or enter the credential again to replace it.`;
  }
}

function describe(result: SiteSettingsClientResult<unknown>): string {
  if (result.kind === "credential-unavailable") return credentialFailureMessage(result.error);
  if (result.kind === "application-failure") return result.error.message;
  if (result.kind === "unavailable") return result.message;
  return "";
}

type RowMode = "idle" | "confirming-removal";

export function StoredConnectorRow({
  connector,
  credential,
  loading,
  requests,
  onCredentialSet,
  onCredentialRemoved,
}: {
  readonly connector: ScaffoldStoredConnector;
  readonly credential: CredentialState | undefined;
  readonly loading: boolean;
  readonly requests: SiteSettingsClient;
  readonly onCredentialSet: (slot: CredentialSlot, hint: string) => void;
  readonly onCredentialRemoved: (slot: CredentialSlot) => void;
}) {
  const [secret, setSecret] = useState("");
  const [mode, setMode] = useState<RowMode>("idle");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputId = `credential-${connector.slot}`;
  const configured = credential !== undefined;
  const status = loading ? "Checking…" : configured ? "Connected" : "Not connected";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (secret.trim().length === 0) {
      setMessage(`Enter a ${connector.name} key before saving.`);
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const result = await requests.setCredential(connector.slot, secret);
      if (result.kind !== "completed") {
        // The previous state stands: nothing was stored, so nothing on the row changes.
        setMessage(describe(result));
        return;
      }
      onCredentialSet(result.value.slot, result.value.hint);
      setMessage(`${connector.name} key saved.`);
    } catch {
      setMessage(`The ${connector.name} key could not be saved.`);
    } finally {
      // The secret leaves component state on every path, successful or not, so a later render
      // cannot put it back into the document.
      setSecret("");
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setMessage(null);
    try {
      const result = await requests.removeCredential(connector.slot);
      if (result.kind !== "completed") {
        setMessage(describe(result));
        return;
      }
      onCredentialRemoved(result.value);
      setMessage(`${connector.name} key removed.`);
      setMode("idle");
    } catch {
      setMessage(`The ${connector.name} key could not be removed.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <li
      className={`${styles.connectorRow} ${styles.storedConnectorRow}`}
      data-status={configured ? "connected" : "available"}
      aria-busy={pending}
    >
      <span>
        <strong>{connector.name}</strong>
        <small>{connector.detail}</small>
        <small className={styles.credentialState}>
          {loading
            ? "Reading the stored credential…"
            : !configured
              ? "No key stored"
              : credential.hint.length > 0
                ? `Configured · ending ${credential.hint}`
                : "Configured"}
          {configured && credential.updatedAt !== null ? ` · updated ${credential.updatedAt}` : ""}
        </small>
      </span>
      <span className={styles.connectorStatus}>{status}</span>

      <form className={styles.credentialForm} onSubmit={(event) => void submit(event)}>
        <label htmlFor={inputId}>{connector.label}</label>
        <input
          id={inputId}
          name={inputId}
          type="password"
          autoComplete="off"
          placeholder={configured ? "Enter a new key to replace it" : "Paste the key"}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          disabled={pending}
        />
        <button type="submit" className={styles.primaryAction} disabled={pending}>
          {pending ? "Saving…" : configured ? "Replace key" : "Save key"}
        </button>
        {configured && mode === "idle" ? (
          <button
            type="button"
            className={styles.tertiaryAction}
            disabled={pending}
            onClick={() => setMode("confirming-removal")}
          >
            Remove
          </button>
        ) : null}
      </form>

      {mode === "confirming-removal" ? (
        <div
          className={styles.credentialConfirm}
          role="group"
          aria-label={`Remove ${connector.name} key`}
        >
          <p>
            Remove the {connector.name} key? Every agent path that needs it stops until another key
            is entered.
          </p>
          <button
            type="button"
            className={styles.dangerAction}
            disabled={pending}
            onClick={() => void remove()}
          >
            {pending ? "Removing…" : `Remove ${connector.name} key`}
          </button>
          <button
            type="button"
            className={styles.tertiaryAction}
            disabled={pending}
            onClick={() => setMode("idle")}
          >
            Keep it
          </button>
        </div>
      ) : null}

      {message === null ? null : (
        <p className={styles.credentialMessage} role="status">
          {message}
        </p>
      )}
    </li>
  );
}

type CatalogState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly models: readonly CatalogModel[] }
  | { readonly kind: "unavailable"; readonly message: string };

/** Enough of a number to judge whether a review schema fits, without spelling out every digit. */
function describeContext(contextLength: number): string {
  if (contextLength >= 1_000_000)
    return `${String(Math.round(contextLength / 100_000) / 10)}M context`;
  return contextLength >= 1000
    ? `${String(Math.round(contextLength / 1000))}k context`
    : `${String(contextLength)} context`;
}

export function AgentModelsForm({
  models,
  loading,
  requests,
  catalog,
  onModelsSaved,
}: {
  readonly models: SiteModelIds | null;
  readonly loading: boolean;
  readonly requests: SiteSettingsClient;
  readonly catalog: ModelCatalogClient;
  readonly onModelsSaved: (models: SiteModelIds) => void;
}) {
  const [draft, setDraft] = useState<Partial<Record<SiteModelRole, string>>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [provider, setProvider] = useState<ModelCatalogProviderId>(MODEL_CATALOG_PROVIDERS[0].id);
  const [catalogState, setCatalogState] = useState<CatalogState>({ kind: "loading" });
  const [manual, setManual] = useState(false);

  useEffect(() => {
    let live = true;
    void catalog.readCatalog().then(
      (result) => {
        if (live) setCatalogState(result);
      },
      () => {
        if (live)
          setCatalogState({ kind: "unavailable", message: MODEL_CATALOG_UNAVAILABLE_MESSAGE });
      },
    );
    return () => {
      live = false;
    };
  }, [catalog]);

  if (loading || models === null) {
    return (
      <p role="status">
        {loading ? "Reading the agent models…" : "The agent models could not be read."}
      </p>
    );
  }

  const valueFor = (role: SiteModelRole) => draft[role] ?? models[role];
  const available = catalogState.kind === "loaded" ? catalogState.models : [];
  const edit = (role: SiteModelRole, value: string) =>
    setDraft((current) => ({ ...current, [role]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (models === null) return;
    const candidate = Object.fromEntries(
      SITE_MODEL_ROLES.map((role) => [role, draft[role] ?? models[role]]),
    ) as unknown as SiteModelIds;
    setPending(true);
    setMessage(null);
    try {
      const result = await requests.saveModels(candidate);
      if (result.kind !== "completed") {
        // The edits stay in the form so the operator can correct them rather than retype them.
        setMessage(describe(result));
        return;
      }
      // The saved settings are whatever the server says they are, not what was typed.
      onModelsSaved(result.value.models);
      setDraft({});
      setMessage("Agent models saved.");
    } catch {
      setMessage("The agent models could not be saved.");
    } finally {
      setPending(false);
    }
  }

  function roleField(role: SiteModelRole) {
    const value = valueFor(role);
    const known = available.some((model) => model.id === value);

    if (catalogState.kind === "loaded" && !manual) {
      return (
        <select
          id={`model-${role}`}
          name={role}
          value={value}
          onChange={(event) => edit(role, event.target.value)}
          disabled={pending}
        >
          {/*
            A slug the catalog no longer lists stays selected and says so. Providers retire
            models, and silently moving a role onto some other model because a third party
            rotated its catalog would replace a working configuration without telling anyone.
          */}
          {known ? null : <option value={value}>{`${value} · not in this catalog`}</option>}
          {available.map((model) => (
            <option key={model.id} value={model.id}>
              {`${model.name} · ${describeContext(model.contextLength)}`}
            </option>
          ))}
        </select>
      );
    }

    if (catalogState.kind === "loading") {
      return (
        <select id={`model-${role}`} name={role} value={value} disabled>
          <option value={value}>{value}</option>
        </select>
      );
    }

    return (
      <input
        id={`model-${role}`}
        name={role}
        value={value}
        onChange={(event) => edit(role, event.target.value)}
        disabled={pending || !manual}
      />
    );
  }

  return (
    <form
      className={styles.agentModelsForm}
      aria-busy={pending}
      onSubmit={(event) => void submit(event)}
    >
      <div className={styles.modelProviderChoice}>
        <label htmlFor="model-provider">Model provider</label>
        <select
          id="model-provider"
          name="provider"
          value={provider}
          onChange={(event) => setProvider(event.target.value as ModelCatalogProviderId)}
          disabled={pending}
        >
          {MODEL_CATALOG_PROVIDERS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      {catalogState.kind === "unavailable" ? (
        <div className={styles.modelCatalogNotice}>
          <p role="status">{catalogState.message}</p>
          {manual ? null : (
            <button type="button" className={styles.tertiaryAction} onClick={() => setManual(true)}>
              Enter a model slug by hand
            </button>
          )}
        </div>
      ) : null}

      {SITE_MODEL_ROLES.map((role) => (
        <div key={role}>
          <label htmlFor={`model-${role}`}>{MODEL_ROLE_LABELS[role]}</label>
          {roleField(role)}
          {catalogState.kind === "loaded" &&
          !manual &&
          !available.some((model) => model.id === valueFor(role)) ? (
            <small className={styles.unrecognisedModel}>
              {`${valueFor(role)} is not in the catalog. It is kept until you choose another.`}
            </small>
          ) : null}
        </div>
      ))}
      <button type="submit" className={styles.primaryAction} disabled={pending}>
        {pending ? "Saving…" : "Save agent models"}
      </button>
      {message === null ? null : <p role="status">{message}</p>}
    </form>
  );
}

const DESTINATION_KIND_LABELS: Readonly<Record<SiteDestinationKind, string>> = {
  studiocms: "StudioCMS",
  wordpress: "WordPress",
};

/**
 * The base URL means a different thing to each destination, and getting it wrong fails at the far
 * end as a bare 404 that names nothing. StudioCMS is addressed at its REST base, while the
 * WordPress adapter appends `/wp-json/wp/v2/posts` itself and so wants the site root alone.
 */
const DESTINATION_BASE_URL_GUIDANCE: Readonly<Record<SiteDestinationKind, string>> = {
  studiocms: "Include the API path, as in https://example.com/studiocms_api/rest/v1",
  wordpress:
    "The site root only, as in https://example.com — StoryRail appends /wp-json/wp/v2/posts itself.",
};

interface DestinationDraft {
  readonly kind: SiteDestinationKind;
  readonly studiocms: { readonly baseUrl: string; readonly package: string };
  readonly wordpress: { readonly baseUrl: string; readonly username: string };
  readonly draft: boolean;
}

const EMPTY_DRAFT: DestinationDraft = {
  kind: "wordpress",
  studiocms: { baseUrl: "", package: "" },
  wordpress: { baseUrl: "", username: "" },
  draft: DEFAULT_DESTINATION_DRAFT,
};

function draftFrom(destination: SiteDestinationSettings | null): DestinationDraft {
  if (destination === null) return EMPTY_DRAFT;
  return destination.kind === "studiocms"
    ? {
        ...EMPTY_DRAFT,
        kind: "studiocms",
        studiocms: { baseUrl: destination.baseUrl, package: destination.package },
        draft: destination.draft,
      }
    : {
        ...EMPTY_DRAFT,
        kind: "wordpress",
        wordpress: { baseUrl: destination.baseUrl, username: destination.username },
        draft: destination.draft,
      };
}

/**
 * The stored destination, edited in the shape the chosen kind actually has.
 *
 * The two kinds keep their own fields in state rather than sharing them, so an operator who
 * looks at the other kind and comes back has not lost what they typed — and so a value belonging
 * to one kind can never be submitted as part of the other.
 */
export function DestinationForm({
  destination,
  models,
  loading,
  requests,
  onDestinationSaved,
}: {
  readonly destination: SiteDestinationSettings | null;
  readonly models: SiteModelIds | null;
  readonly loading: boolean;
  readonly requests: SiteSettingsClient;
  readonly onDestinationSaved: (destination: SiteDestinationSettings | null) => void;
}) {
  const [edits, setEdits] = useState<DestinationDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading || models === null) {
    return (
      <p role="status">
        {loading ? "Reading the destination…" : "The destination could not be read."}
      </p>
    );
  }

  const current = edits ?? draftFrom(destination);
  const kind = current.kind;
  const edit = (change: Partial<DestinationDraft>) => setEdits({ ...current, ...change });

  function candidate(): SiteDestinationSettings | { readonly problem: string } {
    if (kind === "studiocms") {
      const { baseUrl, package: renderer } = current.studiocms;
      if (baseUrl.trim().length === 0) return { problem: "Enter the StudioCMS REST base URL." };
      if (renderer.trim().length === 0)
        return { problem: "Name the StudioCMS renderer package to store content under." };
      return {
        kind,
        baseUrl: baseUrl.trim(),
        package: renderer.trim(),
        draft: current.draft,
      };
    }
    const { baseUrl, username } = current.wordpress;
    if (baseUrl.trim().length === 0) return { problem: "Enter the WordPress site URL." };
    if (username.trim().length === 0)
      return { problem: "Name the WordPress user the Application Password belongs to." };
    return { kind, baseUrl: baseUrl.trim(), username: username.trim(), draft: current.draft };
  }

  async function save(next: SiteDestinationSettings | null) {
    if (models === null) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await requests.saveDestination(models, next);
      if (result.kind !== "completed") {
        // Nothing was stored, so the edits stay on screen to be corrected rather than retyped.
        setMessage(describe(result));
        return;
      }
      // What is now configured is whatever the store says, never what was typed at it.
      onDestinationSaved(result.value.destination);
      setEdits(null);
      setConfirmingRemoval(false);
      setMessage(
        result.value.destination === null
          ? "Destination removed. Publishing a Story no longer delivers it anywhere."
          : "Destination saved.",
      );
    } catch {
      setMessage("The destination could not be saved.");
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = candidate();
    if ("problem" in next) {
      setMessage(next.problem);
      return;
    }
    void save(next);
  }

  return (
    <form className={styles.destinationForm} aria-busy={pending} onSubmit={submit}>
      <div className={styles.destinationKindChoice}>
        <label htmlFor="destination-kind">Destination</label>
        <select
          id="destination-kind"
          name="kind"
          value={kind}
          onChange={(event) => edit({ kind: event.target.value as SiteDestinationKind })}
          disabled={pending}
        >
          {SITE_DESTINATION_KINDS.map((option) => (
            <option key={option} value={option}>
              {DESTINATION_KIND_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="destination-base-url">Base URL</label>
        <input
          id="destination-base-url"
          name="baseUrl"
          inputMode="url"
          value={kind === "studiocms" ? current.studiocms.baseUrl : current.wordpress.baseUrl}
          onChange={(event) =>
            edit(
              kind === "studiocms"
                ? { studiocms: { ...current.studiocms, baseUrl: event.target.value } }
                : { wordpress: { ...current.wordpress, baseUrl: event.target.value } },
            )
          }
          disabled={pending}
        />
        <small className={styles.destinationHint}>{DESTINATION_BASE_URL_GUIDANCE[kind]}</small>
      </div>

      {kind === "studiocms" ? (
        <div>
          <label htmlFor="destination-package">Renderer package</label>
          <input
            id="destination-package"
            name="package"
            value={current.studiocms.package}
            onChange={(event) =>
              edit({ studiocms: { ...current.studiocms, package: event.target.value } })
            }
            disabled={pending}
          />
          <small className={styles.destinationHint}>
            Which renderer StudioCMS stores the body under, such as @studiocms/markdown-remark.
          </small>
        </div>
      ) : (
        <div>
          <label htmlFor="destination-username">WordPress user</label>
          <input
            id="destination-username"
            name="username"
            autoComplete="off"
            value={current.wordpress.username}
            onChange={(event) =>
              edit({ wordpress: { ...current.wordpress, username: event.target.value } })
            }
            disabled={pending}
          />
          <small className={styles.destinationHint}>
            The user the Application Password above belongs to. It is half of an HTTP Basic header
            rather than a secret, so it is stored in plain settings.
          </small>
        </div>
      )}

      <div className={styles.destinationDraftChoice}>
        <label htmlFor="destination-draft">
          <input
            id="destination-draft"
            name="draft"
            type="checkbox"
            checked={current.draft}
            onChange={(event) => edit({ draft: event.target.checked })}
            disabled={pending}
          />
          Deliver as a draft
        </label>
        <small className={styles.destinationHint}>
          StoryRail writes the page and a human decides it is fit to be seen. Turn this off and a
          published Story appears on the site the moment it is delivered.
        </small>
      </div>

      <div className={styles.destinationActions}>
        <button type="submit" className={styles.primaryAction} disabled={pending}>
          {pending ? "Saving…" : "Save destination"}
        </button>
        {destination !== null && !confirmingRemoval ? (
          <button
            type="button"
            className={styles.tertiaryAction}
            disabled={pending}
            onClick={() => setConfirmingRemoval(true)}
          >
            Remove destination
          </button>
        ) : null}
      </div>

      {confirmingRemoval ? (
        <div className={styles.credentialConfirm} role="group" aria-label="Remove the destination">
          <p>
            Remove the destination? Publishing a Story keeps working and records the decision, but
            nothing is delivered anywhere until one is configured again. The stored keys are left
            where they are.
          </p>
          <button
            type="button"
            className={styles.dangerAction}
            disabled={pending}
            onClick={() => void save(null)}
          >
            {pending ? "Removing…" : "Remove destination"}
          </button>
          <button
            type="button"
            className={styles.tertiaryAction}
            disabled={pending}
            onClick={() => setConfirmingRemoval(false)}
          >
            Keep it
          </button>
        </div>
      ) : null}

      {message === null ? null : <p role="status">{message}</p>}
    </form>
  );
}
