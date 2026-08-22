import type { ArticleGroundingMeasurement } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";

const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * Two numbers that answer different questions, shown together because either alone is
 * misleading. A Revision can be fully supported and still be its source restated, and reporting
 * only how much of it was cited would call that a success.
 */
export function groundingReading(measurement: ArticleGroundingMeasurement): {
  readonly grounded: string;
  readonly derived: string;
  readonly verdict: string;
} {
  const { groundedShare, derivedShare, claimBlocks, contextBlocks } = measurement;
  const verdict =
    groundedShare === null
      ? "Nothing to weigh yet."
      : groundedShare === 0
        ? "Nothing in this Article is attributed to its evidence."
        : derivedShare !== null && derivedShare >= 0.5
          ? "Largely its sources restated. Grounded, but it adds little."
          : groundedShare < 0.5
            ? "Most of this Article rests on the Writer rather than the evidence."
            : "Mostly attributed, and mostly written rather than copied.";
  return {
    grounded: groundedShare === null ? "—" : percent(groundedShare),
    derived: derivedShare === null ? "—" : percent(derivedShare),
    verdict: `${claimBlocks} cited ${claimBlocks === 1 ? "claim" : "claims"}, ${contextBlocks} uncited. ${verdict}`,
  };
}

export function GroundingSummary({
  measurement,
}: Readonly<{ measurement: ArticleGroundingMeasurement }>) {
  const reading = groundingReading(measurement);
  return (
    <section className={styles.groundingSummary} aria-label="Article grounding">
      <div>
        <dl>
          <div>
            <dt>Attributed</dt>
            <dd>{reading.grounded}</dd>
          </div>
          <div>
            <dt>Carried over</dt>
            <dd>{reading.derived}</dd>
          </div>
          <div>
            <dt>Citations</dt>
            <dd>{measurement.citations}</dd>
          </div>
        </dl>
        <p>{reading.verdict}</p>
      </div>
    </section>
  );
}
