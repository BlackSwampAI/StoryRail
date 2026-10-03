"use client";

import { useEffect, useMemo, useState } from "react";

import type { PublicationBrief } from "@/domain/editorial/newsroom-standards-types";
import {
  MAXIMUM_PUBLICATION_BRIEF_FIELD_CHARACTERS,
  MAXIMUM_STANDARDS_CHARACTERS,
} from "@/domain/editorial";

import { useNewsroomClients } from "./newsroom-clients";
import type { NewsroomStandardsClient, StandardsRevision } from "./newsroom-standards-client";
import styles from "./newsroom-shell.module.css";

const EMPTY_BRIEF: PublicationBrief = {
  audience: "",
  readerBenefit: "",
  coverageCriteria: "",
  voice: "",
  avoid: "",
};

const BRIEF_QUESTIONS: readonly {
  readonly key: keyof PublicationBrief;
  readonly label: string;
  readonly hint: string;
  readonly required?: boolean;
  readonly placeholder: string;
}[] = [
  {
    key: "audience",
    label: "Who do you write for?",
    hint: "Name the readers you want to serve. A few words are enough.",
    required: true,
    placeholder: "People who live and work in the harbour district",
  },
  {
    key: "readerBenefit",
    label: "What do you help them understand or do?",
    hint: "What should someone understand or be able to do after reading?",
    required: true,
    placeholder: "A clear picture of what changed and what happens next",
  },
  {
    key: "coverageCriteria",
    label: "What makes a story worth covering?",
    hint: "Optional. Describe the subjects or signals that make a story useful here.",
    placeholder: "Changes to public services, local decisions, and their effects",
  },
  {
    key: "voice",
    label: "How should your articles sound?",
    hint: "Optional. Choose a voice in everyday words.",
    placeholder: "Direct, calm, and clear about what is known",
  },
  {
    key: "avoid",
    label: "What should writers avoid?",
    hint: "Optional. Add boundaries that help agents make good choices.",
    placeholder: "Hype, insider shorthand, and guesses presented as facts",
  },
];

function cleanBrief(value: PublicationBrief | undefined): PublicationBrief {
  return value ?? EMPTY_BRIEF;
}

function summaryLines(brief: PublicationBrief): readonly string[] {
  return [
    `Audience: ${brief.audience.trim() || "Not set yet"}`,
    `Reader benefit: ${brief.readerBenefit.trim() || "Not set yet"}`,
    ...(brief.coverageCriteria.trim() ? [`Coverage: ${brief.coverageCriteria.trim()}`] : []),
    ...(brief.voice.trim() ? [`Voice: ${brief.voice.trim()}`] : []),
    ...(brief.avoid.trim() ? [`Avoid: ${brief.avoid.trim()}`] : []),
  ].filter(Boolean);
}

/** A publication brief gives every agent enough context without asking for a house-style manual. */
export function NewsroomStandardsEditor({
  requests: suppliedRequests,
  onBriefSaved,
}: Readonly<{
  requests?: NewsroomStandardsClient;
  onBriefSaved?: () => void;
}> = {}) {
  const clients = useNewsroomClients();
  const requests = suppliedRequests ?? clients.newsroomStandards;
  const [history, setHistory] = useState<readonly StandardsRevision[] | null>(null);
  const [text, setText] = useState("");
  const [brief, setBrief] = useState<PublicationBrief>(EMPTY_BRIEF);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void requests
      .listRevisions()
      .then((result) => {
        if (!active) return;
        if (result.kind === "unavailable") {
          setStatus("The newsroom brief could not be read. Try again.");
          return;
        }
        setHistory(result.revisions);
        const current = result.revisions.at(-1);
        setText(current?.text ?? "");
        setBrief(cleanBrief(current?.brief));
        setStatus(null);
      })
      .catch(() => {
        if (active) setStatus("The newsroom brief could not be read. Try again.");
      });
    return () => {
      active = false;
    };
  }, [requests, loadAttempt]);

  const current = history?.at(-1);
  const summary = useMemo(() => summaryLines(brief), [brief]);
  const briefTouched = BRIEF_QUESTIONS.some(({ key }) => brief[key].trim().length > 0);
  const requiresBrief = briefTouched || Boolean(current?.brief);
  const briefReady = requiresBrief
    ? brief.audience.trim().length > 0 && brief.readerBenefit.trim().length > 0
    : text.trim().length > 0;
  const changed =
    text !== (current?.text ?? "") ||
    BRIEF_QUESTIONS.some(({ key }) => brief[key] !== (current?.brief?.[key] ?? ""));

  async function save(): Promise<void> {
    if (saving || !briefReady) return;
    setSaving(true);
    setStatus(null);
    try {
      const normalizedBrief: PublicationBrief = {
        audience: brief.audience.trim(),
        readerBenefit: brief.readerBenefit.trim(),
        coverageCriteria: brief.coverageCriteria.trim(),
        voice: brief.voice.trim(),
        avoid: brief.avoid.trim(),
      };
      const result = await requests.saveRevision(text, requiresBrief ? normalizedBrief : undefined);
      if (result.kind === "unavailable") {
        setStatus("The newsroom brief could not be saved. Your answers are still here; try again.");
        return;
      }
      setHistory([...(history ?? []), result.revision]);
      setText(result.revision.text);
      setBrief(cleanBrief(result.revision.brief));
      if (result.revision.brief) onBriefSaved?.();
      setStatus(
        `Saved newsroom brief as revision ${result.revision.revisionNumber}. It applies to the next run.`,
      );
    } catch {
      setStatus("The newsroom brief could not be saved. Your answers are still here; try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.standardsEditor} aria-labelledby="newsroom-standards-title">
      <header>
        <p className={styles.sectionKicker}>Set the publication&apos;s direction</p>
        <h3 id="newsroom-standards-title">Newsroom brief</h3>
        <p>
          A few clear answers help every agent judge what belongs and who it serves. Keep it short;
          you can change any answer later. Evidence and citation rules remain in force.
        </p>
      </header>

      {history === null && status === null ? <p role="status">Loading newsroom brief…</p> : null}

      <div className={styles.briefQuestionGrid}>
        {BRIEF_QUESTIONS.map(({ key, label, hint, required, placeholder }) => (
          <label key={key}>
            {label}
            {required ? " *" : ""}
            <span>{hint}</span>
            <textarea
              aria-label={label}
              value={brief[key]}
              maxLength={MAXIMUM_PUBLICATION_BRIEF_FIELD_CHARACTERS}
              rows={key === "audience" || key === "readerBenefit" ? 2 : 3}
              placeholder={placeholder}
              disabled={saving || history === null}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setBrief((currentBrief) => ({ ...currentBrief, [key]: value }));
              }}
            />
          </label>
        ))}
      </div>

      <section className={styles.briefSummary} aria-labelledby="brief-summary-title">
        <header>
          <h4 id="brief-summary-title">Your publication summary</h4>
          <p>Review and edit any answer above before saving.</p>
        </header>
        <ul>
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {requiresBrief && !briefReady ? (
          <p>Answer the first two questions to complete this brief.</p>
        ) : null}
      </section>

      <label>
        Additional editorial standards
        <textarea
          value={text}
          rows={6}
          maxLength={MAXIMUM_STANDARDS_CHARACTERS}
          disabled={saving || history === null}
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder="For example: use sentence case for headlines."
        />
      </label>
      <p className={styles.briefHint}>
        Optional. Existing standards are kept alongside this brief when you save.
      </p>

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
          disabled={saving || !briefReady || !changed || history === null}
          onClick={() => void save()}
        >
          {saving
            ? "Saving…"
            : briefTouched || current?.brief
              ? "Save newsroom brief"
              : "Save editorial standards"}
        </button>
      </div>
      {status ? (
        <p role={status.startsWith("Saved") ? "status" : "alert"}>
          {status}{" "}
          {status.includes("could not be read") ? (
            <button
              type="button"
              onClick={() => {
                setStatus(null);
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              Try again
            </button>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
