import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompactStoryRail, StoryRail } from "./story-rail";
import { PINNED_BAND_HEIGHT_PX } from "./story-rail-stops";
import { useFullRailOutOfView } from "./story-rail-visibility";

/**
 * jsdom has no IntersectionObserver and no layout to observe, so one is installed here that
 * records what it was asked to watch and lets a test say the rail went behind the band. What is
 * being proven is the decision the hook makes from that, not the browser's geometry.
 */
interface FakeObserver {
  readonly options: IntersectionObserverInit | undefined;
  readonly observed: Element[];
  readonly disconnected: boolean;
  report(isIntersecting: boolean): void;
}

const observers: FakeObserver[] = [];

function installObserver() {
  class Fake {
    private readonly callback: IntersectionObserverCallback;
    private readonly record: FakeObserver;
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.callback = callback;
      const record = {
        options,
        observed: [] as Element[],
        disconnected: false,
        report: (isIntersecting: boolean) =>
          act(() => {
            this.callback(
              [{ isIntersecting } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
          }),
      };
      this.record = record as unknown as FakeObserver;
      observers.push(this.record);
    }
    observe(element: Element) {
      this.record.observed.push(element);
    }
    disconnect() {
      (this.record as { disconnected: boolean }).disconnected = true;
    }
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", Fake);
}

function Workspace({ storyId }: Readonly<{ storyId: string | null }>) {
  const outOfView = useFullRailOutOfView(storyId);
  return (
    <div>
      {outOfView ? <CompactStoryRail state="in_review" delivered={false} /> : null}
      <StoryRail state="in_review" delivered={false} />
    </div>
  );
}

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
});

describe("when the pinned band takes over from the rail", () => {
  it("shows nothing in the band while the full rail is still in view", () => {
    installObserver();
    render(<Workspace storyId="story-103" />);

    expect(screen.queryByRole("region", { name: "Story position" })).toBeNull();
  });

  it("reveals the compact rail only once the full rail has gone behind the band", () => {
    installObserver();
    render(<Workspace storyId="story-103" />);

    observers[0]?.report(false);

    // The full rail is still in the document — it has scrolled away, not been removed — so what
    // is proven here is that the band answers only once the reader can no longer see it answered.
    expect(screen.getByRole("region", { name: "Story position" })).toHaveTextContent("Review");
  });

  it("hides it again when the full rail comes back into view", () => {
    installObserver();
    render(<Workspace storyId="story-103" />);

    observers[0]?.report(false);
    observers[0]?.report(true);

    expect(screen.queryByRole("region", { name: "Story position" })).toBeNull();
  });

  it("counts the rail as gone when it passes behind the band, not when it leaves the viewport", () => {
    installObserver();
    render(<Workspace storyId="story-103" />);

    expect(observers[0]?.options?.rootMargin).toBe(`-${PINNED_BAND_HEIGHT_PX}px 0px 0px 0px`);
  });

  it("watches the rail belonging to the Story that is open", () => {
    installObserver();
    render(<Workspace storyId="story-103" />);

    expect(observers[0]?.observed[0]).toBe(document.getElementById("story-rail"));
  });

  it("stops watching when no Story is open", () => {
    installObserver();
    const { rerender } = render(<Workspace storyId="story-103" />);
    observers[0]?.report(false);

    rerender(<Workspace storyId={null} />);

    expect(observers[0]?.disconnected).toBe(true);
    expect(screen.queryByRole("region", { name: "Story position" })).toBeNull();
  });

  it("leaves the full rail as the only account of position where nothing can observe it", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Workspace storyId="story-103" />);

    expect(screen.getByRole("region", { name: "Story rail" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Story position" })).toBeNull();
  });
});
