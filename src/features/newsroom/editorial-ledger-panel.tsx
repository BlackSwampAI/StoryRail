import type { LedgerEntry, RevisionStep } from "@/application/editorial-ledger";
import type { EditorialActor } from "@/domain/editorial";

import { groundingReading } from "./grounding-summary";
import styles from "./newsroom-shell.module.css";

const GROUNDING_FINDING_SUMMARY: Readonly<Record<string, string>> = {
  CITATION_EVIDENCE_UNKNOWN: "cited evidence not on this Assignment",
  CITATION_SOURCE_MISMATCH: "Source does not own the cited evidence",
  CITATION_QUOTE_UNSUPPORTED: "not found in the cited evidence",
};

function who(actor: EditorialActor): string {
  return actor.type === "operator" ? actor.operatorId : `${actor.role} run`;
}

export function formatDuration(tookMs: number | null | undefined): string | null {
  if (tookMs === null || tookMs === undefined) return null;
  return tookMs < 1000 ? `${tookMs}ms` : `${(tookMs / 1000).toFixed(1)}s`;
}

/**
 * The Story's working record, in the order it happened.
 *
 * Every step was already durable and none of it was legible without reading three separate
 * lists against each other. A refused run in particular carried its reason into the database
 * and nowhere a person would look.
 */
export function EditorialLedger({
  entries,
  revisions,
}: Readonly<{ entries: readonly LedgerEntry[]; revisions: readonly RevisionStep[] }>) {
  return (
    <section className={styles.ledger} aria-labelledby="editorial-ledger-heading">
      <h4 id="editorial-ledger-heading">Working record</h4>
      {entries.length === 0 ? (
        <p>Nothing has happened to this Story yet.</p>
      ) : (
        <ol className={styles.ledgerList}>
          {entries.map((entry, index) => (
            <li key={`${entry.kind}-${index}`} data-outcome={entry.outcome ?? entry.kind}>
              <p className={styles.ledgerTitle}>
                <span>{entry.title}</span>
                {entry.outcome === "failed" ? <em>refused</em> : null}
              </p>
              {entry.detail ? <p className={styles.ledgerDetail}>{entry.detail}</p> : null}
              {entry.failure ? (
                <div className={styles.ledgerFailure}>
                  <p>{entry.failure.code}</p>
                  {entry.failure.findings ? (
                    <ul>
                      {entry.failure.findings.map((finding) => (
                        <li key={`${finding.blockIndex}-${finding.citationIndex}`}>
                          <q>{finding.quote}</q>{" "}
                          <span>— {GROUNDING_FINDING_SUMMARY[finding.code] ?? finding.code}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {entry.failure.unsupportedChecks ? (
                    <p>
                      Checks quoting the Article wrongly:{" "}
                      {entry.failure.unsupportedChecks.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p className={styles.ledgerMeta}>
                {who(entry.actor)}
                {entry.model ? ` · ${entry.model.model}` : ""}
                {formatDuration(entry.tookMs) ? ` · ${formatDuration(entry.tookMs)}` : ""}
                {` · ${entry.at}`}
              </p>
            </li>
          ))}
        </ol>
      )}

      <h4>Revisions</h4>
      {revisions.length === 0 ? (
        <p>No Article has been drafted yet.</p>
      ) : (
        <ol className={styles.revisionSteps}>
          {revisions.map((step) => {
            const reading = groundingReading(step.measurement);
            return (
              <li key={step.revision.id}>
                <p className={styles.ledgerTitle}>
                  <span>
                    Revision {step.revision.revisionNumber} · {step.revision.headline}
                  </span>
                </p>
                <p className={styles.ledgerMeta}>
                  {reading.grounded} attributed · {reading.derived} carried over ·{" "}
                  {step.measurement.citations} citations
                </p>
                {step.directorInstruction ? (
                  <p className={styles.ledgerDetail}>
                    <strong>Director asked for:</strong> {step.directorInstruction}
                  </p>
                ) : null}
                {step.requestedBecause ? (
                  <p className={styles.ledgerDetail}>
                    <strong>Recorded reason:</strong> {step.requestedBecause}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
