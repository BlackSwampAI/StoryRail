import { DragDropProvider } from "@dnd-kit/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoryInspection } from "@/application/story-inspection";
import type { StoryDelivery } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import { StoryWorkspace } from "./story-workspace";
import { STORY_REQUEST_UNAVAILABLE_MESSAGE, type StoryClient } from "./story-client";

const unavailable = async () =>
  ({ kind: "unavailable", message: STORY_REQUEST_UNAVAILABLE_MESSAGE }) as const;

function requests(overrides: Partial<StoryClient> = {}): StoryClient {
  return {
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
    ...overrides,
  } as StoryClient;
}

const DELIVERY = {
  id: "delivery-71",
  storyId: "story-71",
  revisionId: "revision-71",
  destination: "wordpress",
  destinationInstanceId: "wordpress:https://newsroom.test",
  remoteId: "412",
  request: {
    operation: "create" as const,
    slug: "a-delivered-headline",
    draft: true,
    bodyCharacters: 640,
  },
  startedAt: "2026-08-25T09:00:00.000Z",
  outcome: "succeeded" as const,
  completedAt: "2026-08-25T09:00:04.000Z",
  result: { status: 201, message: null },
} as unknown as StoryDelivery;

function inspection(options: {
  readonly state?: StoryInspection["story"]["state"];
  readonly deliveries?: readonly StoryDelivery[];
}): StoryInspection {
  const story = {
    id: "story-71",
    title: "A delivered Story",
    state: options.state ?? "published",
    revisionCycle: 0,
    createdAt: "created",
    updatedAt: "published",
  } as const;
  const assignment = {
    id: "assignment-71",
    storyId: story.id,
    writerProfileId: "writer-71",
    sourceIds: ["source-71"],
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    assignedBy: { type: "operator", operatorId: "operator-71" },
    assignedAt: "assigned",
  } as const;
  return {
    story,
    sources: [],
    assignment: {
      assignment,
      writerProfile: {
        id: "writer-71",
        role: "writer",
        name: "Writer",
        instructions: "Write.",
        model: null,
        builtIn: true,
      },
    },
    transitions: [],
    reviewDecisions: [],
    deliveries: options.deliveries ?? [],
    toolCalls: [],
    agentRuns: [],
    article: {
      article: {
        id: "article-71",
        storyId: story.id,
        assignmentId: assignment.id,
        createdAt: "drafted",
      },
      revisions: [
        {
          id: "revision-71",
          articleId: "article-71",
          revisionNumber: 1,
          writerProfileId: "writer-71",
          agentRunId: "writer-run-71",
          headline: "A delivered headline",
          dek: null,
          blocks: [{ kind: "context", markdown: "Article body.", citations: [] }],
          createdBy: { type: "agent", role: "writer", runId: "writer-run-71" },
          createdAt: "drafted",
        },
      ],
    },
  } as unknown as StoryInspection;
}

function renderWorkspace(value: StoryInspection, client: StoryClient) {
  return render(
    <DragDropProvider>
      <StoryWorkspace
        inspection={value}
        requests={client}
        staff={{ kind: "loaded", profiles: [] }}
        onAssigned={vi.fn()}
        onWriterCompleted={vi.fn()}
        onReviewStateChanged={vi.fn()}
      />
    </DragDropProvider>,
  );
}

describe("delivering a published Story from the screen", () => {
  it("offers the action and says a published Story has not been sent anywhere", () => {
    renderWorkspace(inspection({}), requests());

    expect(screen.getByText(/has not been sent anywhere/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deliver to the destination" })).toBeTruthy();
  });

  // Pinned to the foot of the viewport, this card covered about 200px of the Article at every
  // scroll position, so the finished piece could only be read through a letterbox.
  it("scrolls with the Article rather than sitting over it", () => {
    renderWorkspace(inspection({}), requests());

    const panel = screen
      .getByRole("heading", { name: "This Story is published" })
      .closest("section");
    expect(panel).not.toBeNull();
    expect(panel?.className).toContain(styles.publishedTask);
    expect(panel?.className).not.toContain(styles.reviewTask);
    // The Article is still on the page beneath it, which is what the operator came to read.
    expect(screen.getAllByText("Article body.").length).toBeGreaterThan(0);
  });

  it("does not offer delivery for a Story that is not published", () => {
    renderWorkspace(inspection({ state: "approved" }), requests());

    expect(screen.queryByRole("button", { name: /Deliver to the destination/ })).toBeNull();
  });

  // The ISO value is the durable record and stays in the audit panel. An operator reading a
  // delivery panel is being told when something happened, and a machine timestamp makes them
  // decode it.
  it("names the destination, the page and the time an accepted delivery completed", () => {
    renderWorkspace(inspection({ deliveries: [DELIVERY] }), requests());

    expect(screen.getByText(/Delivered to wordpress as/)).toBeTruthy();
    expect(screen.getByText("412")).toBeTruthy();
    expect(screen.getByText(/25 Aug 2026, 09:00:04 UTC/)).toBeTruthy();
    expect(screen.queryByText(/2026-08-25T09:00:04.000Z/)).toBeNull();
  });

  // A second delivery is how a later Revision reaches the post already made, so the action stays
  // available after a success and says it is an update rather than a new post.
  it("reads a further delivery as an update to the post already made", () => {
    renderWorkspace(inspection({ deliveries: [DELIVERY] }), requests());

    expect(screen.getByRole("button", { name: "Update the delivered post" })).toBeTruthy();
  });

  it("shows both addresses when the destination renamed the page", () => {
    const renamed = {
      ...DELIVERY,
      result: {
        status: 201,
        message: null,
        requestedSlug: "a-delivered-headline",
        assignedSlug: "a-delivered-headline-2",
      },
    } as unknown as StoryDelivery;
    renderWorkspace(inspection({ deliveries: [renamed] }), requests());

    expect(screen.getByText(/changed the address/)).toBeTruthy();
    expect(screen.getByText("a-delivered-headline-2")).toBeTruthy();
  });

  it("explains a recorded failure as prose and still offers the action", () => {
    const refused = {
      ...DELIVERY,
      remoteId: null,
      outcome: "failed",
      failure: { code: "DESTINATION_UNAUTHORIZED", message: null },
    } as unknown as StoryDelivery;
    renderWorkspace(inspection({ deliveries: [refused] }), requests());

    expect(screen.getByText(/refused the credential it was given/)).toBeTruthy();
    expect(screen.getByText(/\(DESTINATION_UNAUTHORIZED\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deliver to the destination" })).toBeTruthy();
  });

  it("says nothing was sent when no destination or credential is configured", async () => {
    const deliverStory = vi.fn<StoryClient["deliverStory"]>(async () => ({
      kind: "not-attempted",
      error: { code: "DESTINATION_NOT_CONFIGURED", message: "No destination is configured." },
    }));
    renderWorkspace(inspection({}), requests({ deliverStory }));

    fireEvent.click(screen.getByRole("button", { name: "Deliver to the destination" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Nothing was sent.");
    });
    expect(screen.getByRole("alert").textContent).not.toContain("refused");
  });

  it("reports an attempt the destination refused as an attempt, not as a missing setting", async () => {
    const deliverStory = vi.fn<StoryClient["deliverStory"]>(async () => ({
      kind: "refused",
      error: { code: "DESTINATION_REJECTED", message: "The destination declined the page." },
      delivery: null,
    }));
    renderWorkspace(inspection({}), requests({ deliverStory }));

    fireEvent.click(screen.getByRole("button", { name: "Deliver to the destination" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("attempted and refused");
    });
  });

  // A draft is a post a human still has to approve; a live one is not, so only that one is
  // confirmed before it goes.
  it("confirms before delivering to a destination known to publish live", async () => {
    const live = {
      ...DELIVERY,
      request: { ...DELIVERY.request, draft: false },
    } as unknown as StoryDelivery;
    const deliverStory = vi.fn<StoryClient["deliverStory"]>(async () => ({
      kind: "delivered",
      delivery: live,
    }));
    renderWorkspace(inspection({ deliveries: [live] }), requests({ deliverStory }));

    fireEvent.click(screen.getByRole("button", { name: "Update the delivered post" }));
    expect(deliverStory).not.toHaveBeenCalled();
    expect(screen.getByText(/publishes live rather than as a draft/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Publish it live now" }));
    await waitFor(() => {
      expect(deliverStory).toHaveBeenCalledWith("story-71");
    });
  });

  it("re-reads the durable record after an attempt rather than trusting the answer alone", async () => {
    const inspectStory = vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: inspection({ deliveries: [DELIVERY] }),
    }));
    const deliverStory = vi.fn<StoryClient["deliverStory"]>(async () => ({
      kind: "delivered",
      delivery: DELIVERY,
    }));
    renderWorkspace(inspection({}), requests({ deliverStory, inspectStory }));

    fireEvent.click(screen.getByRole("button", { name: "Deliver to the destination" }));

    await waitFor(() => {
      expect(inspectStory).toHaveBeenCalledWith("story-71");
    });
  });
});
