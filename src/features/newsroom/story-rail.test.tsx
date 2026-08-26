import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AgentRun } from "@/domain/editorial";

import { railActivity, railFailure, resolveStoryRail } from "./story-rail-stops";
import { CompactStoryRail, StoryRail } from "./story-rail";

const RAIL_IN_ORDER = [
  "Intake",
  "Assigned",
  "Drafting",
  "Review",
  "Approved",
  "Published",
  "Delivered",
];

/** The stop names alone, in the order the rail draws them. */
function stopLabels(): readonly string[] {
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => RAIL_IN_ORDER.find((label) => item.textContent?.startsWith(label)) ?? "");
}

function stopNamed(label: string): HTMLElement {
  const item = within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .find((element) => element.textContent?.startsWith(label));
  if (!item) throw new Error(`No rail stop named ${label}`);
  return item;
}

describe("the rail a Story travels", () => {
  it("names every stop of the journey in order, ending at delivery", () => {
    render(<StoryRail state="intake" delivered={false} />);

    expect(stopLabels()).toEqual([
      "Intake",
      "Assigned",
      "Drafting",
      "Review",
      "Approved",
      "Published",
      "Delivered",
    ]);
  });

  it("names what is still ahead rather than hiding it until the Story gets there", () => {
    render(<StoryRail state="intake" delivered={false} />);

    for (const label of RAIL_IN_ORDER.slice(1))
      expect(stopNamed(label)).toHaveAttribute("data-position", "ahead");
  });

  it("marks where the Story stands now and what it has already passed", () => {
    render(<StoryRail state="in_review" delivered={false} />);

    expect(stopNamed("Review")).toHaveAttribute("aria-current", "step");
    expect(stopNamed("Intake")).toHaveAttribute("data-position", "behind");
    expect(stopNamed("Drafting")).toHaveAttribute("data-position", "behind");
    expect(stopNamed("Approved")).toHaveAttribute("data-position", "ahead");
  });

  it("treats delivery as its own point, so a published Story that was never sent says so", () => {
    render(<StoryRail state="published" delivered={false} />);

    expect(stopNamed("Published")).toHaveAttribute("aria-current", "step");
    expect(stopNamed("Delivered")).toHaveAttribute("data-position", "ahead");
  });

  it("moves to the delivered stop only once the destination has taken the Article", () => {
    render(<StoryRail state="published" delivered />);

    expect(stopNamed("Delivered")).toHaveAttribute("aria-current", "step");
    expect(stopNamed("Published")).toHaveAttribute("data-position", "behind");
  });

  it("reads a rejected Story as having left the rail rather than standing on it", () => {
    render(<StoryRail state="rejected" delivered={false} leftFrom="in_review" />);

    expect(screen.getByText(/left the rail at Review/)).toBeVisible();
    for (const label of RAIL_IN_ORDER)
      expect(stopNamed(label)).not.toHaveAttribute("aria-current", "step");
  });

  it("still reads as having left the rail when nothing recorded where it left from", () => {
    render(<StoryRail state="rejected" delivered={false} />);

    expect(screen.getByText(/left the rail\./)).toBeVisible();
  });

  it("says on the track what the newsroom is doing, without a panel to open", () => {
    render(
      <StoryRail
        state="assigned"
        delivered={false}
        activity="The Writer is drafting the Article."
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("The Writer is drafting the Article.");
  });

  it("puts a stopped run on the track, in words", () => {
    render(
      <StoryRail
        state="assigned"
        delivered={false}
        failure="The Writer failed. The model did not answer in time."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("The Writer failed.");
  });
});

describe("reading a Story's position on the rail", () => {
  it("puts a Story sent back for changes at the same stop as one being drafted", () => {
    const drafting = resolveStoryRail({ state: "in_progress", delivered: false });
    const revising = resolveStoryRail({ state: "changes_requested", delivered: false });

    const currentOf = (reading: ReturnType<typeof resolveStoryRail>) =>
      reading.stops.find((stop) => stop.position === "current")?.id;
    expect(currentOf(drafting)).toBe("drafting");
    expect(currentOf(revising)).toBe("drafting");
  });

  it("counts every stop a rejected Story reached as behind it", () => {
    const reading = resolveStoryRail({
      state: "rejected",
      delivered: false,
      leftFrom: "approved",
    });

    expect(reading.offRail).toBe(true);
    expect(reading.leftFrom?.label).toBe("Approved");
    expect(reading.stops.filter((stop) => stop.position === "behind")).toHaveLength(5);
  });
});

const RUN = {
  id: "run-1",
  storyId: "story-rail",
  profileId: "profile-1",
  model: { provider: "openrouter", model: "a/b" },
  prompt: { key: "writer", version: "1" },
  requestedBy: { type: "operator", operatorId: "operator-1" },
  startedAt: "2026-08-26T09:00:00.000Z",
  completedAt: null,
  input: { evidence: [], unavailableSourceIds: [] },
} as unknown as AgentRun;

function run(fields: Record<string, unknown>): AgentRun {
  return { ...RUN, ...fields } as unknown as AgentRun;
}

describe("what the rail says is happening", () => {
  it("names the agent at work and what it is working on", () => {
    expect(
      railActivity([run({ role: "writer", operation: "article_revision", outcome: "running" })]),
    ).toContain("revising");
    expect(
      railActivity([
        run({ role: "editor_in_chief", operation: "article_review", outcome: "running" }),
      ]),
    ).toContain("Director");
  });

  it("says nothing while no run is in flight", () => {
    expect(
      railActivity([run({ role: "writer", operation: "article_draft", outcome: "succeeded" })]),
    ).toBeNull();
  });

  it("reports a failure the watcher would otherwise have to go looking for", () => {
    const message = railFailure([
      run({
        role: "writer",
        operation: "article_draft",
        outcome: "failed",
        failure: { code: "MODEL_REQUEST_TIMED_OUT", retryable: true },
      }),
    ]);

    expect(message).toContain("The Writer failed.");
    expect(message).toContain("MODEL_REQUEST_TIMED_OUT");
  });

  it("stops reporting a failure that a later run has already moved past", () => {
    expect(
      railFailure([
        run({
          id: "run-old",
          role: "writer",
          operation: "article_draft",
          outcome: "failed",
          failure: { code: "MODEL_REQUEST_TIMED_OUT", retryable: true },
        }),
        run({ id: "run-new", role: "writer", operation: "article_draft", outcome: "succeeded" }),
      ]),
    ).toBeNull();
  });
});

describe("the compact rail in the pinned band", () => {
  it("names where the Story is without teaching what the process is", () => {
    render(<CompactStoryRail state="in_review" delivered={false} />);

    const compact = screen.getByRole("region", { name: "Story position" });
    expect(compact).toHaveTextContent("Review");
    expect(compact).not.toHaveTextContent("The Director reads the draft");
  });

  it("keeps the shape of the whole journey as marks, so position is read against it", () => {
    const { container } = render(<CompactStoryRail state="assigned" delivered={false} />);

    expect(container.querySelectorAll("li")).toHaveLength(RAIL_IN_ORDER.length);
    expect(container.querySelectorAll('li[data-position="current"]')).toHaveLength(1);
    expect(container.querySelector('li[data-position="behind"]')).not.toBeNull();
  });

  it("keeps delivery a stop of its own, as the full rail does", () => {
    const { rerender, container } = render(
      <CompactStoryRail state="published" delivered={false} />,
    );
    expect(screen.getByRole("region", { name: "Story position" })).toHaveTextContent("Published");

    rerender(<CompactStoryRail state="published" delivered />);
    expect(screen.getByRole("region", { name: "Story position" })).toHaveTextContent("Delivered");
    expect(container.querySelectorAll('li[data-position="behind"]')).toHaveLength(6);
  });

  it("says a rejected Story is off the rail rather than lighting a stop on it", () => {
    const { container } = render(
      <CompactStoryRail state="rejected" delivered={false} leftFrom="approved" />,
    );

    expect(screen.getByRole("region", { name: "Story position" })).toHaveTextContent(
      "Off the rail at Approved",
    );
    expect(container.querySelectorAll('li[data-position="current"]')).toHaveLength(0);
  });
});
