"use client";

import styles from "./newsroom-shell.module.css";
import {
  SCAFFOLD_OPERATOR,
  SCAFFOLD_SETTINGS,
  type ConnectionStatus,
  type ScaffoldSection,
} from "./account-scaffold";

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

function Section({ section }: Readonly<{ section: ScaffoldSection }>) {
  return (
    <section className={styles.settingsSection} aria-labelledby={`settings-${section.id}`}>
      <header>
        <h3 id={`settings-${section.id}`}>{section.title}</h3>
        <p>{section.summary}</p>
      </header>

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

      {section.connectors ? (
        <ul className={styles.connectorList}>
          {section.connectors.map((connector) => (
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

      <div className={styles.profileCard}>
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

export function SettingsWorkspace() {
  return (
    <section className={styles.accountWorkspace} aria-labelledby="settings-title">
      <header className={styles.sourceWorkspaceHeader}>
        <p className={styles.sectionKicker}>Account</p>
        <h1 id="settings-title">Settings</h1>
        <p>What this newsroom runs on, and what it will connect to.</p>
      </header>

      <ScaffoldNotice>
        None of these controls do anything yet. They lay out the milestones on the roadmap so the
        shape can be judged before any of it is built.
      </ScaffoldNotice>

      <nav className={styles.settingsIndex} aria-label="Settings sections">
        {SCAFFOLD_SETTINGS.map((section) => (
          <a key={section.id} href={`#settings-${section.id}`}>
            {section.title}
          </a>
        ))}
      </nav>

      {SCAFFOLD_SETTINGS.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </section>
  );
}
