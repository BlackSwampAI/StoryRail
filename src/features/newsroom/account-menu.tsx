"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./newsroom-shell.module.css";
import { SCAFFOLD_OPERATOR } from "./account-scaffold";

export interface AccountMenuProps {
  readonly onOpenProfile: () => void;
  readonly onOpenSettings: () => void;
  readonly activeItem?: "profile" | "settings";
}

/**
 * The signed-in affordance: identity and account-level navigation sit apart from the editorial
 * desk on the left, which is about work rather than about the person doing it.
 */
export function AccountMenu({ onOpenProfile, onOpenSettings, activeItem }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className={styles.accountMenu} ref={containerRef}>
      <button
        type="button"
        className={styles.accountTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.accountAvatar} aria-hidden="true">
          {SCAFFOLD_OPERATOR.initials}
        </span>
        <span className={styles.accountTriggerText}>
          <strong>{SCAFFOLD_OPERATOR.displayName}</strong>
          <small>{SCAFFOLD_OPERATOR.newsroom}</small>
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <div className={styles.accountPopover} role="menu" aria-label="Account">
          <p className={styles.accountPopoverHeader}>
            <strong>{SCAFFOLD_OPERATOR.displayName}</strong>
            <small>{SCAFFOLD_OPERATOR.role}</small>
          </p>
          <button
            type="button"
            role="menuitem"
            className={styles.accountPopoverItem}
            aria-current={activeItem === "profile" ? "page" : undefined}
            onClick={() => choose(onOpenProfile)}
          >
            Profile
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.accountPopoverItem}
            aria-current={activeItem === "settings" ? "page" : undefined}
            onClick={() => choose(onOpenSettings)}
          >
            Settings
          </button>
          <button type="button" role="menuitem" className={styles.accountPopoverItem} disabled>
            Sign out
          </button>
          <p className={styles.accountPopoverNote}>
            Accounts are scaffolding. StoryRail has no sign-in yet.
          </p>
        </div>
      ) : null}
    </div>
  );
}
