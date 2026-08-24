"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { CredentialSlot, SiteModelIds } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import { NEWSROOM_THEMES, type NewsroomThemeId } from "./theme";
import {
  AGENT_MODELS_SECTION_ID,
  SCAFFOLD_OPERATOR,
  SCAFFOLD_SETTINGS,
  type ConnectionStatus,
  type ScaffoldSection,
} from "./account-scaffold";
import { modelCatalogClient, type ModelCatalogClient } from "./model-catalog-client";
import { siteSettingsClient, type SiteSettingsClient } from "./site-settings-client";
import {
  AgentModelsForm,
  StoredConnectorRow,
  credentialFailureMessage,
  type CredentialState,
} from "./site-settings-sections";

const STATUS_LABEL: Readonly<Record<ConnectionStatus, string>> = {
  connected: "Connected",
  available: "Not connected",
  planned: "Planned",
};

function ScaffoldNotice({ children }: Readonly<{ children: string }>) {
  return (
    <p className={styles.scaffoldNotice} role="note">
      <span className={styles.scaffoldBadge}>Scaffolding</span>
      {children}
    </p>
  );
}

function Section({
  section,
  storedRows,
  children,
}: Readonly<{
  readonly section: ScaffoldSection;
  readonly storedRows?: ReactNode;
  readonly children?: ReactNode;
}>) {
  return (
    <section className={styles.settingsSection} aria-labelledby={`settings-${section.id}`}>
      <header>
        <h3 id={`settings-${section.id}`}>{section.title}</h3>
        <p>{section.summary}</p>
      </header>

      {children}

      {section.fields ? (
        <dl className={styles.settingsFields}>
          {section.fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>
                {field.value}
                {field.hint ? <small>{field.hint}</small> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {section.connectors || storedRows ? (
        <ul className={styles.connectorList}>
          {storedRows}
          {(section.connectors ?? []).map((connector) => (
            <li key={connector.name} className={styles.connectorRow} data-status={connector.status}>
              <span>
                <strong>{connector.name}</strong>
                <small>{connector.detail}</small>
              </span>
              <span className={styles.connectorStatus}>{STATUS_LABEL[connector.status]}</span>
              <button type="button" className={styles.secondaryAction} disabled>
                {connector.status === "connected" ? "Manage" : "Connect"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function ProfileWorkspace() {
  return (
    <section className={styles.accountWorkspace} aria-labelledby="profile-title">
      <header className={styles.sourceWorkspaceHeader}>
        <p className={styles.sectionKicker}>Account</p>
        <h1 id="profile-title">Profile</h1>
        <p>Who editorial decisions are attributed to.</p>
      </header>

      <ScaffoldNotice>
        Nothing here is stored or editable. StoryRail attributes every decision to the operator
        configured for this environment.
      </ScaffoldNotice>

      <div className={styles.accountProfileCard}>
        <span className={styles.profileAvatar} aria-hidden="true">
          {SCAFFOLD_OPERATOR.initials}
        </span>
        <div>
          <h2>{SCAFFOLD_OPERATOR.displayName}</h2>
          <p>{SCAFFOLD_OPERATOR.role}</p>
        </div>
      </div>

      <dl className={styles.settingsFields}>
        <div>
          <dt>Operator ID</dt>
          <dd>{SCAFFOLD_OPERATOR.handle}</dd>
        </div>
        <div>
          <dt>Newsroom</dt>
          <dd>{SCAFFOLD_OPERATOR.newsroom}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{SCAFFOLD_OPERATOR.role}</dd>
        </div>
        <div>
          <dt>Sign-in</dt>
          <dd>
            Not implemented
            <small>Every action is attributed to the configured operator.</small>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export interface SettingsWorkspaceProps {
  readonly theme: NewsroomThemeId;
  readonly onThemeChange: (theme: NewsroomThemeId) => void;
  readonly requests?: SiteSettingsClient;
  readonly catalog?: ModelCatalogClient;
}

type StoredSettingsState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded";
      readonly models: SiteModelIds;
      readonly credentials: ReadonlyMap<CredentialSlot, CredentialState>;
    }
  | { readonly kind: "unavailable"; readonly message: string };

export function SettingsWorkspace({
  theme,
  onThemeChange,
  requests = siteSettingsClient,
  catalog = modelCatalogClient,
}: SettingsWorkspaceProps) {
  const [stored, setStored] = useState<StoredSettingsState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void requests.readSettings().then(
      (result) => {
        if (!active) return;
        setStored(
          result.kind === "completed"
            ? {
                kind: "loaded",
                models: result.value.settings.models,
                credentials: new Map(
                  result.value.credentials.map((credential) => [
                    credential.slot,
                    { hint: credential.hint, updatedAt: credential.updatedAt },
                  ]),
                ),
              }
            : {
                kind: "unavailable",
                message:
                  result.kind === "credential-unavailable"
                    ? credentialFailureMessage(result.error)
                    : result.kind === "application-failure"
                      ? result.error.message
                      : result.message,
              },
        );
      },
      () => {
        if (active) setStored({ kind: "unavailable", message: "Stored settings are unavailable." });
      },
    );
    return () => {
      active = false;
    };
  }, [requests]);

  function replaceCredential(slot: CredentialSlot, credential: CredentialState | null) {
    setStored((current) => {
      if (current.kind !== "loaded") return current;
      const credentials = new Map(current.credentials);
      if (credential === null) credentials.delete(slot);
      else credentials.set(slot, credential);
      return { ...current, credentials };
    });
  }

  const loading = stored.kind === "loading";

  return (
    <section className={styles.accountWorkspace} aria-labelledby="settings-title">
      <header className={styles.sourceWorkspaceHeader}>
        <p className={styles.sectionKicker}>Account</p>
        <h1 id="settings-title">Settings</h1>
        <p>What this newsroom runs on, and what it will connect to.</p>
      </header>

      <ScaffoldNotice>
        Three things here are real and stored: the OpenRouter key, the Firecrawl key, and the model
        each agent role runs on. Every other row is layout for a milestone on the roadmap and does
        nothing.
      </ScaffoldNotice>

      {stored.kind === "unavailable" ? (
        <p role="alert">The stored settings could not be read. {stored.message}</p>
      ) : null}

      <nav className={styles.settingsIndex} aria-label="Settings sections">
        <a href="#settings-appearance">Appearance</a>
        {SCAFFOLD_SETTINGS.map((section) => (
          <a key={section.id} href={`#settings-${section.id}`}>
            {section.title}
          </a>
        ))}
      </nav>

      {/* The one setting that is real: it changes only how the newsroom looks. */}
      <section className={styles.settingsSection} aria-labelledby="settings-appearance">
        <header>
          <h3 id="settings-appearance">Appearance</h3>
          <p>Pick how the newsroom looks. This is the one setting here that works.</p>
        </header>
        <div className={styles.themeChoices} role="radiogroup" aria-label="Theme">
          {NEWSROOM_THEMES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={theme === option.id}
              className={styles.themeChoice}
              data-theme-preview={option.id}
              onClick={() => onThemeChange(option.id)}
            >
              <span className={styles.themeSwatch} aria-hidden="true">
                <i data-swatch="page" />
                <i data-swatch="panel" />
                <i data-swatch="accent" />
              </span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              <span className={styles.themeScheme}>{option.scheme}</span>
            </button>
          ))}
        </div>
      </section>

      {SCAFFOLD_SETTINGS.map((section) => (
        <Section
          key={section.id}
          section={section}
          storedRows={(section.storedConnectors ?? []).map((connector) => (
            <StoredConnectorRow
              key={connector.slot}
              connector={connector}
              credential={
                stored.kind === "loaded" ? stored.credentials.get(connector.slot) : undefined
              }
              loading={loading}
              requests={requests}
              onCredentialSet={(slot, hint) => replaceCredential(slot, { hint, updatedAt: null })}
              onCredentialRemoved={(slot) => replaceCredential(slot, null)}
            />
          ))}
        >
          {section.id === AGENT_MODELS_SECTION_ID ? (
            <AgentModelsForm
              models={stored.kind === "loaded" ? stored.models : null}
              catalog={catalog}
              loading={loading}
              requests={requests}
              onModelsSaved={(models) =>
                setStored((current) =>
                  current.kind === "loaded" ? { ...current, models } : current,
                )
              }
            />
          ) : null}
        </Section>
      ))}
    </section>
  );
}
