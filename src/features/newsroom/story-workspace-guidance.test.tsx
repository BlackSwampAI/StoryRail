import { DragDropProvider } from "@dnd-kit/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoryInspection } from "@/application/story-inspection";

import styles from "./newsroom-shell.module.css";
import { STORY_REQUEST_UNAVAILABLE_MESSAGE, type StoryClient } from "./story-client";
import { StoryWorkspace } from "./story-workspace";

const unavailable = async () =>
  ({ kind: "unavailable" as const, message: STORY_REQUEST_UNAVAILABLE_MESSAGE }) as const;

const requests = {
  listStories: vi.fn(unavailable),
  createStory: vi.fn(unavailable),
  attachSource: vi.fn(unavailable),
  inspectStory: vi.fn(unavailable),
  assignStory: vi.fn(unavailable),
  startAutopilot: vi.fn(unavailable),
  startSourceResearch: vi.fn(unavailable),
  generateAssignmentProposal: vi.fn(unavailable),
  createWriterDraft: vi.fn(unavailable),
  createWriterRevision: vi.fn(unavailable),
  rejectStory: vi.fn(unavailable),
  publishStory: vi.fn(unavailable),
  submitReview: vi.fn(unavailable),
  runDirectorReview: vi.fn(unavailable),
  recordReviewDecision: vi.fn(unavailable),
  deliverStory: vi.fn(unavailable),
} as unknown as StoryClient;

function inspection(state: StoryInspection["story"]["state"]): StoryInspection {
  const story = {
    id: "story-103",
    title: "A Story on the rail",
    state,
    revisionCycle: 0,
    createdAt: "created",
    updatedAt: "updated",
  } as const;
  const assignment = {
    id: "assignment-103",
    storyId: story.id,
    writerProfileId: "writer-103",
    sourceIds: ["source-103"],
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    assignedBy: { type: "operator", operatorId: "operator-103" },
    assignedAt: "assigned",
  } as const;
  const written = state !== "intake" && state !== "assigned";
  return {
    story,
    sources: [],
    assignment:
      state === "intake"
        ? null
        : {
            assignment,
            writerProfile: {
              id: "writer-103",
              role: "writer",
              name: "Writer",
              instructions: "Write.",
              model: null,
              builtIn: true,
            },
          },
    transitions: [],
    reviewDecisions: [],
    deliveries: [],
    toolCalls: [],
    agentRuns: [],
    article: written
      ? {
          article: {
            id: "article-103",
            storyId: story.id,
            assignmentId: assignment.id,
            createdAt: "drafted",
          },
          revisions: [
            {
              id: "revision-103",
              articleId: "article-103",
              revisionNumber: 1,
              writerProfileId: "writer-103",
              agentRunId: "writer-run-103",
              headline: "A Story on the rail",
              dek: null,
              blocks: [{ kind: "context", markdown: "Article body.", citations: [] }],
              createdBy: { type: "agent", role: "writer", runId: "writer-run-103" },
              createdAt: "drafted",
            },
          ],
        }
      : null,
  } as unknown as StoryInspection;
}

function renderWorkspace(state: StoryInspection["story"]["state"]) {
  return render(
    <DragDropProvider>
      <StoryWorkspace
        inspection={inspection(state)}
        requests={requests}
        staff={{ kind: "loaded", profiles: [] }}
        onAssigned={vi.fn()}
        onWriterCompleted={vi.fn()}
        onReviewStateChanged={vi.fn()}
      />
    </DragDropProvider>,
  );
}

describe("what the Story workspace tells someone who is only watching", () => {
  it("shows the whole journey, including delivery, before the Story has travelled any of it", () => {
    renderWorkspace("intake");

    const rail = screen.getByRole("region", { name: "Story rail" });
    expect(within(rail).getByText("Delivered")).toBeVisible();
    expect(within(rail).getByText("Intake").closest("li")).toHaveAttribute("aria-current", "step");
  });

  /**
   * One action per stop, named for what it does to the Story. "Run Writer" describes StoryRail's
   * machinery; "Write the draft" describes what the operator came to do.
   */
  it.each([
    ["intake", "Draw up the Assignment"],
    ["assigned", "Write the draft"],
    ["in_progress", "Send this draft to the Director"],
    ["in_review", "Ask the Director to read it"],
    ["approved", "Publish this Story"],
    ["published", "Deliver to the destination"],
  ] as const)("offers one action in %s, named for its effect: %s", (state, action) => {
    const { container } = renderWorkspace(state);

    expect(screen.getByRole("button", { name: action })).toBeVisible();
    expect(container.querySelectorAll(`.${styles.primaryAction}`)).toHaveLength(1);
  });

  it("claims nowhere that StoryRail cannot deliver the Article", () => {
    for (const state of ["in_progress", "approved", "published"] as const) {
      const { container, unmount } = renderWorkspace(state);
      expect(container.textContent).not.toMatch(/does not deliver/i);
      expect(container.textContent).not.toMatch(/deliver the Article anywhere yet/i);
      unmount();
    }
  });

  it("says what a reason is for and who reads it later, beside the field", () => {
    renderWorkspace("approved");
    fireEvent.click(screen.getByRole("button", { name: "Publish this Story" }));

    const field = screen.getByLabelText("Why this Story is being published");
    const purpose = document.getElementById(field.getAttribute("aria-describedby") ?? "");
    expect(purpose?.textContent).toMatch(/anyone reading back through this Story later/);
  });

  it("leaves a reason field empty rather than seeding it with a sentence that reads as a hint", () => {
    renderWorkspace("approved");
    fireEvent.click(screen.getByRole("button", { name: "Publish this Story" }));

    expect(screen.getByLabelText("Why this Story is being published")).toHaveValue("");
  });
});

/**
 * The Article is what the operator came to read, and a task card pinned to the viewport hides a
 * strip of it at every scroll position. Read from the stylesheet because that is where the fault
 * lived: the card rendered correctly and still sat over the prose.
 */
describe("what covers the Article", () => {
  it("pins no task panel over the Article in any state", () => {
    const stylesheet = readFileSync(
      join(process.cwd(), "src/features/newsroom/newsroom-shell.module.css"),
      "utf8",
    );

    for (const selector of [".reviewTask", ".publishedTask", ".directorReview", ".currentTask"]) {
      const rules = stylesheet.matchAll(new RegExp(`\\${selector}[^{}]*\\{([^}]*)\\}`, "g"));
      for (const [, body] of rules) expect(body).not.toMatch(/position:\s*(sticky|fixed)/);
    }
  });
});

/**
 * The standing complaint about this product is that its headers eat about half the fold, so the
 * one band that is now permanent is the one place a few pixels must not creep back. Read from
 * the stylesheet because that is where it would creep.
 */
describe("the band pinned above the workspace", () => {
  it("asks for no more height than the 3.5rem it was cut to", () => {
    const stylesheet = readFileSync(
      join(process.cwd(), "src/features/newsroom/newsroom-shell.module.css"),
      "utf8",
    );

    const band = /\.workspaceNavigation \{([^}]*)\}/.exec(stylesheet)?.[1] ?? "";
    expect(band).toMatch(/min-height:\s*3\.5rem/);
    expect(band).not.toMatch(/(?<!-)height:\s*(?!auto)/);
  });

  it("adds nothing to the band that contends for its height", () => {
    const railStyles = readFileSync(
      join(process.cwd(), "src/features/newsroom/story-rail.module.css"),
      "utf8",
    );

    const compact = /\.compactRail \{([^}]*)\}/.exec(railStyles)?.[1] ?? "";
    expect(compact).not.toMatch(/(min-)?height:/);
    expect(compact).not.toMatch(/padding/);
  });
});
