"use client";

import { useEffect, useState } from "react";

import { MAXIMUM_STANDARDS_CHARACTERS } from "@/domain/editorial";

import { useNewsroomClients } from "./newsroom-clients";
import type { NewsroomStandardsClient, StandardsRevision } from "./newsroom-standards-client";
import styles from "./newsroom-shell.module.css";

/**
 * One document every agent works under.
 *
 * The built-in Profiles carry a sentence of role instruction each; this is where a newsroom says
 * how it actually writes. Editing appends a revision rather than replacing one, so a piece
 * written last month can still be explained by the standards that were in force then.
 */
export function NewsroomStandardsEditor({
  requests: suppliedRequests,
}: Readonly<{ requests?: NewsroomStandardsClient }> = {}) {
  const clients = useNewsroomClients();
  const requests = suppliedRequests ?? clients.newsroomStandards;
  const [history, setHistory] = useState<readonly StandardsRevision[] | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await requests.listRevisions();
      if (!active) return;
      if (result.kind === "unavailable") {
        setStatus("The newsroom standards could not be read.");
        return;
      }
      setHistory(result.revisions);
      setText(result.revisions.at(-1)?.text ?? "");
    })();
    return () => {
      active = false;
    };
  }, [requests]);

  async function save(): Promise<void> {
    if (saving || text.trim().length === 0) return;
    setSaving(true);
    setStatus(null);
    try {
      const result = await requests.saveRevision(text);
      if (result.kind === "unavailable") {
        setStatus("The newsroom standards could not be saved.");
        return;
      }
      setHistory([...(history ?? []), result.revision]);
      setStatus(`Saved as revision ${result.revision.revisionNumber}. It applies to the next run.`);
    } finally {
      setSaving(false);
    }
  }

  const current = history?.at(-1);
  return (
    <section className={styles.standardsEditor} aria-labelledby="newsroom-standards-title">
      <header>
        <p className={styles.sectionKicker}>Every agent works under these</p>
        <h3 id="newsroom-standards-title">Editorial standards</h3>
        <p>
          Voice, usage, and what this publication does not do. Applied to the Assignment Editor,
          Researcher, Writer, and Director alike. They never relax the rules about evidence and
          citation: those are checked after the model answers, so a house style cannot argue past
          them.
        </p>
      </header>
      <label>
        Standards
        <textarea
          value={text}
          rows={12}
          maxLength={MAXIMUM_STANDARDS_CHARACTERS}
          onChange={(event) => setText(event.target.value)}
          placeholder="Headlines are sentence case. Never write that a company &ldquo;boasts&rdquo; anything."
        />
      </label>
      <div className={styles.standardsFooter}>
        <span>
          {text.length} / {MAXIMUM_STANDARDS_CHARACTERS}
          {current
            ? ` · revision ${current.revisionNumber}, saved ${current.updatedAt}`
            : " · not set"}
        </span>
        <button
          type="button"
          className={styles.primaryAction}
          disabled={saving || text.trim().length === 0 || text === (current?.text ?? "")}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save revision"}
        </button>
      </div>
      {status ? <p role={status.startsWith("Saved") ? "status" : "alert"}>{status}</p> : null}
    </section>
  );
}
