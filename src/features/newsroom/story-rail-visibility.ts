"use client";

import { useEffect, useState } from "react";

import { PINNED_BAND_HEIGHT_PX } from "./story-rail-stops";

/** How the observer finds the full rail without a ref threaded through the workspace. */
export const FULL_RAIL_ELEMENT_ID = "story-rail";

/**
 * Whether the full rail has scrolled behind the pinned band.
 *
 * The compact rail exists to replace something the reader has lost, so it appears only once that
 * loss is real: showing both at once would put the same answer on the screen twice, which is
 * noise in the one mode this workspace is built for — left running and glanced at.
 *
 * Where IntersectionObserver is unavailable this answers false, so the compact rail is simply
 * never revealed and the full rail remains the only account of position. That is the safe way to
 * be wrong: a reader misses a convenience rather than seeing a duplicate or a stale position.
 */
export function useFullRailOutOfView(storyKey: string | null): boolean {
  // Carried with the Story it was observed against rather than reset when the Story changes, so
  // opening another one cannot briefly answer with the previous Story's scroll position.
  const [observed, setObserved] = useState<{
    readonly storyKey: string | null;
    readonly outOfView: boolean;
  }>({ storyKey, outOfView: false });
  useEffect(() => {
    if (storyKey === null || typeof IntersectionObserver === "undefined") return;
    const rail = document.getElementById(FULL_RAIL_ELEMENT_ID);
    if (rail === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry !== undefined) setObserved({ storyKey, outOfView: !entry.isIntersecting });
      },
      { rootMargin: `-${PINNED_BAND_HEIGHT_PX}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(rail);
    return () => observer.disconnect();
  }, [storyKey]);
  return observed.storyKey === storyKey && observed.outOfView;
}
