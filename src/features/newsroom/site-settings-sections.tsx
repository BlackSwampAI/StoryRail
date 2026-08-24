"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  SITE_MODEL_ROLES,
  type CredentialSlot,
  type CredentialUnavailableError,
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
