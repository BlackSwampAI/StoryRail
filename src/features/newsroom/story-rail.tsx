import type { StoryState } from "@/domain/editorial";

import { resolveStoryRail } from "./story-rail-stops";
import styles from "./story-rail.module.css";

/**
 * The Story's journey, as the primary object on the screen.
 *
 * The way this is used most is unattended and watched: the operator is not clicking, so the rail
 * has to carry where the Story is, what is happening inside that stop, and what is still ahead,
 * all at a glance and all without a second panel to open. Stops ahead are named rather than
 * hidden, because seeing Delivered from the first screen is how somebody learns what StoryRail
 * does without being told.
 */
export function StoryRail({
  state,
  delivered,
  leftFrom,
  activity,
  failure,
}: Readonly<{
  state: StoryState;
  delivered: boolean;
  leftFrom?: StoryState;
  /** What the newsroom is doing at this stop right now, if anything. */
  activity?: string | null;
  /** A stopped run, said in words on the track rather than left to be discovered. */
  failure?: string | null;
}>) {
  const rail = resolveStoryRail({ state, delivered, leftFrom });
  return (
    <section className={styles.rail} aria-labelledby="story-rail-heading">
      <h2 id="story-rail-heading" className={styles.railHeading}>
        Story rail
      </h2>
      <ol className={styles.railStops}>
        {rail.stops.map((stop) => (
          <li
            key={stop.id}
            className={styles.railStop}
            data-position={stop.position}
            aria-current={stop.position === "current" ? "step" : undefined}
          >
            <span className={styles.railMark} aria-hidden="true" />
            <span className={styles.railLabel}>{stop.label}</span>
            <span className={styles.railSummary}>{stop.summary}</span>
            {stop.position === "behind" ? (
              <span className={styles.railVisuallyHidden}>Done</span>
            ) : null}
          </li>
        ))}
      </ol>
      {rail.offRail ? (
        <p className={styles.railLeft}>
          {rail.leftFrom === null
            ? "This Story left the rail. Work on it ended and nothing further will happen to it."
            : `This Story left the rail at ${rail.leftFrom.label}. Work on it ended and nothing further will happen to it.`}
        </p>
      ) : null}
      {activity ? (
        <p className={styles.railActivity} role="status" aria-live="polite">
          {activity}
        </p>
      ) : null}
      {failure ? (
        <p className={styles.railFailure} role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
