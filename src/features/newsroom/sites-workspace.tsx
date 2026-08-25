"use client";

import { useState, type FormEvent } from "react";

import { canonicalizeSiteDomain, type Site } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import { siteClient, type SiteClient } from "./site-client";
import { sitePagePath } from "./site-paths";

export interface SitesWorkspaceProps {
  readonly sites: readonly Site[];
  readonly currentSiteId: string;
  readonly requests?: SiteClient;
  readonly onSiteCreated?: (site: Site) => void;
}

export function SitesWorkspace({
  sites,
  currentSiteId,
  requests = siteClient,
  onSiteCreated,
}: SitesWorkspaceProps) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<Site | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setCreated(null);

    // The domain is corrected before it is submitted, so an operator who types the hostname the
    // way it appears on their letterhead sees what will be stored rather than a rejection.
    const canonical = canonicalizeSiteDomain(domain);
    if (!canonical.ok) {
      setMessage(canonical.error.message);
      return;
    }
    setDomain(canonical.domain);

    setSubmitting(true);
    try {
      const result = await requests.createSite({
        name,
        domain: canonical.domain,
        description,
      });
      if (result.kind !== "completed") {
        setMessage(result.kind === "application-failure" ? result.error.message : result.message);
        return;
      }
      setName("");
      setDomain("");
      setDescription("");
      setCreated(result.value);
      setMessage(`${result.value.name} is ready.`);
      onSiteCreated?.(result.value);
    } catch {
      setMessage("The Site request could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.agentsWorkspace} aria-labelledby="sites-workspace-title">
      <header className={styles.agentsHeader}>
        <p className={styles.sectionKicker}>Newsrooms</p>
        <h2 id="sites-workspace-title">Sites</h2>
        <p>
          A Site is a tenant boundary. Stories, Sources, standards, and Agent Profiles belong to
          exactly one, and nothing done on one Site can reach another&rsquo;s work.
        </p>
      </header>

      <div className={styles.profileGrid}>
        {sites.map((site) => (
          <article className={styles.profileCard} key={site.id}>
            <header>
              <div>
                <p>{site.domain}</p>
                <h3>{site.name}</h3>
              </div>
              <span>{site.id === currentSiteId ? "Current" : "Other"}</span>
            </header>
            <p>{site.description}</p>
            <dl>
              <div>
                <dt>Address</dt>
                <dd>
                  <a href={sitePagePath(site.id)}>{sitePagePath(site.id)}</a>
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <form
        className={styles.profileForm}
        id="create-site"
        onSubmit={(event) => void submit(event)}
      >
        <h3>Create a Site</h3>
        <p>
          A new Site starts with the four built-in Agent Profiles and no Stories, Sources, or
          standards of its own.
        </p>
        <label htmlFor="site-name">Name</label>
        <input
          id="site-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={submitting}
        />
        <label htmlFor="site-domain">Domain</label>
        <input
          id="site-domain"
          name="domain"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          disabled={submitting}
        />
        <label htmlFor="site-description">Description</label>
        <textarea
          id="site-description"
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={submitting}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create Site"}
        </button>
        {message === null ? null : <p role="status">{message}</p>}
        {created === null ? null : <a href={sitePagePath(created.id)}>Open {created.name}</a>}
      </form>
    </section>
  );
}
