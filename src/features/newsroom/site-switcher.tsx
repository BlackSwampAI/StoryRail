"use client";

import { useEffect, useRef, useState } from "react";

import type { Site } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import { sitePagePath } from "./site-paths";

export interface SiteSwitcherProps {
  readonly site: Site;
  readonly sites: readonly Site[];
  readonly onCreateSite: () => void;
}

/**
 * Which newsroom this is, always visible, and the way to another one.
 *
 * The Site lives in the URL, so switching is an ordinary link rather than a state change: two
 * tabs can hold two newsrooms and a link someone pastes into a bug report names its tenant.
 */
export function SiteSwitcher({ site, sites, onCreateSite }: SiteSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const alone = sites.length <= 1;

  useEffect(() => {
    if (!open) return;
    function dismiss(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.siteSwitcher} ref={containerRef}>
      <button
        type="button"
        className={styles.siteSwitcherTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current Site, ${site.name}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.siteSwitcherText}>
          <strong>{site.name}</strong>
          <small>{site.domain}</small>
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <div className={styles.siteSwitcherPopover} role="menu" aria-label="Sites">
          {sites.map((candidate) => (
            <a
              key={candidate.id}
              role="menuitem"
              className={styles.siteSwitcherItem}
              aria-current={candidate.id === site.id ? "page" : undefined}
              href={sitePagePath(candidate.id)}
            >
              <strong>{candidate.name}</strong>
              <small>{candidate.domain}</small>
            </a>
          ))}
          <button
            type="button"
            role="menuitem"
            className={styles.siteSwitcherItem}
            onClick={() => {
              setOpen(false);
              onCreateSite();
            }}
          >
            <strong>Create a Site</strong>
            <small>A second newsroom, with its own Stories and Sources</small>
          </button>
        </div>
      ) : null}

      {/* The first new Site is the hard step, so it is not hidden behind a menu until there is
          more than one Site to choose between. */}
      {alone ? (
        <button type="button" className={styles.siteSwitcherCreate} onClick={onCreateSite}>
          <span aria-hidden="true">+</span>
          <span>Create a Site</span>
        </button>
      ) : null}
    </div>
  );
}
