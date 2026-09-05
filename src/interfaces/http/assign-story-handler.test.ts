// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  agentProfileId,
  assignmentId,
  operatorId,
  storyId,
  transitionId,
  type Assignment,
  type Story,
  type StoryTransitionReceipt,
} from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import { createAssignStoryHttpHandler } from "./assign-story-handler";

const story: Story = {
  id: storyId("story-http-0028"),
  title: "Assigned Story",
  state: "assigned",
  revisionCycle: 0,
  createdAt: "created",
  updatedAt: "assigned",
};
const actor = { type: "operator" as const, operatorId: operatorId("operator-http-0028") };
const assignment: Assignment = {
  id: assignmentId("assignment-http-0028"),
  storyId: story.id,
  writerProfileId: agentProfileId("writer-http-0028"),
  sourceIds: [],
  angle: "Angle",
  brief: "Brief",
  constraints: null,
  assignedBy: actor,
  assignedAt: "assigned",
};
const transitionReceipt: StoryTransitionReceipt = {
  transitionId: transitionId("transition-http-0028"),
  storyId: story.id,
  previousState: "intake",
  nextState: "assigned",
  actor,
  reason: "Ready",
  occurredAt: "assigned",
  revisionCycle: 0,
};
const body = {
  writerProfileId: assignment.writerProfileId,
  angle: " Angle ",
  brief: " Brief ",
  constraints: null,
  reason: " Ready ",
};
const context = { params: Promise.resolve({ storyId: story.id }) };
const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  STORYRAIL_OPERATOR_ID: actor.operatorId,
};

function runtimeWith(assignStory: StoryRuntime["assignStory"]): StoryRuntime {
  return {
    listNewsroomStandards: vi.fn() as never,
    setNewsroomStandards: vi.fn() as never,
    policyRuns: vi.fn() as never,
    reconcileAbandonedWork: vi.fn() as never,
    createStory: vi.fn<StoryRuntime["createStory"]>(),
    attachSourceToStory: vi.fn<StoryRuntime["attachSourceToStory"]>(),
    inspectStory: vi.fn<StoryRuntime["inspectStory"]>(),
    listStories: vi.fn<StoryRuntime["listStories"]>(),
    listPendingSources: vi.fn<StoryRuntime["listPendingSources"]>(),
    recordSourceTriageDecision: vi.fn<StoryRuntime["recordSourceTriageDecision"]>(),
    createCustomWriterProfile: vi.fn<StoryRuntime["createCustomWriterProfile"]>(),
    listAgentProfiles: vi.fn<StoryRuntime["listAgentProfiles"]>(),
    assignStory,
    rejectStory: vi.fn<StoryRuntime["rejectStory"]>(),
    publishStory: vi.fn(),
    deliverStory: vi.fn<StoryRuntime["deliverStory"]>(),
    resolveLegacyDeliveryMapping: vi.fn<StoryRuntime["resolveLegacyDeliveryMapping"]>(),
    reconcileStoryDelivery: vi.fn<StoryRuntime["reconcileStoryDelivery"]>(),
    listStoryDeliveries: vi.fn<StoryRuntime["listStoryDeliveries"]>(),
    submitStoryReview: vi.fn<StoryRuntime["submitStoryReview"]>(),
    readSiteSettings: vi.fn<StoryRuntime["readSiteSettings"]>(),
    updateSiteSettings: vi.fn<StoryRuntime["updateSiteSettings"]>(),
    setSiteCredential: vi.fn<StoryRuntime["setSiteCredential"]>(),
    removeSiteCredential: vi.fn<StoryRuntime["removeSiteCredential"]>(),
    recordStoryReviewDecision: vi.fn<StoryRuntime["recordStoryReviewDecision"]>(),
    close: vi.fn<StoryRuntime["close"]>(async () => undefined),
  };
}

function request(value: unknown, contentType = "application/json") {
  return new Request(`https://storyrail.test/api/stories/${story.id}/assignments`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
}

describe("createAssignStoryHttpHandler", () => {
  it("derives the operator and returns authoritative durable facts with 201 and no-store", async () => {
    const assignStory = vi.fn<StoryRuntime["assignStory"]>(async () => ({
      ok: true,
      assignment,
      story,
      transitionReceipt,
    }));
    const handler = createAssignStoryHttpHandler({
      getRuntime: () => runtimeWith(assignStory),
      environment,
    });
    const response = await handler(request(body), context);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      assignment,
      story,
      transitionReceipt,
    });
    expect(assignStory).toHaveBeenCalledWith({ storyId: story.id, ...body, assignedBy: actor });
  });

  it("rejects media type, invalid JSON, and browser-owned or missing fields before runtime access", async () => {
    const getRuntime = vi.fn<() => StoryRuntime>();
    const handler = createAssignStoryHttpHandler({ getRuntime });
    const responses = await Promise.all([
      handler(request(body, "text/plain"), context),
      handler(request("{"), context),
      handler(request({ ...body, sourceIds: [] }), context),
      handler(request({ ...body, reason: undefined }), context),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([415, 400, 400, 400]);
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it.each([
    ["STORY_NOT_FOUND", 404],
    ["AGENT_PROFILE_NOT_FOUND", 404],
    ["INVALID_TRANSITION", 409],
    ["STORY_ASSIGNMENT_CONFLICT", 409],
    ["AGENT_PROFILE_NOT_WRITER", 422],
    ["REASON_REQUIRED", 422],
    ["ASSIGNMENT_ANGLE_REQUIRED", 422],
  ] as const)("maps %s to %i", async (code, expectedStatus) => {
    const assignStory = vi.fn<StoryRuntime["assignStory"]>(
      async () => ({ ok: false, error: { code, message: "Expected failure" } }) as never,
    );
    const handler = createAssignStoryHttpHandler({
      getRuntime: () => runtimeWith(assignStory),
      environment,
    });
    expect((await handler(request(body), context)).status).toBe(expectedStatus);
  });

  it("returns only the safe 500 when runtime work throws", async () => {
    const assignStory = vi.fn<StoryRuntime["assignStory"]>(async () => {
      throw new Error("secret provider detail");
    });
    const handler = createAssignStoryHttpHandler({
      getRuntime: () => runtimeWith(assignStory),
      environment,
    });
    const response = await handler(request(body), context);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).toBe(
      '{"ok":false,"error":{"code":"INTERNAL_SERVER_ERROR","message":"The Story request could not be completed."}}',
    );
  });
});
