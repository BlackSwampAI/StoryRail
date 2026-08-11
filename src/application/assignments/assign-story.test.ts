import { describe, expect, it, vi } from "vitest";

import { createReferenceAgentProfileRepository } from "@/application/agent-profiles/agent-profile-repository.contract";
import { createReferenceStoryInspectionRepositoryHarness } from "@/application/story-inspection/story-inspection-repository.contract";
import { createReferenceStoryRepository } from "@/application/story-persistence/story-repository.contract";
import {
  agentProfileId,
  assignmentId,
  operatorId,
  sourceId,
  storyId,
  transitionId,
  type AgentProfile,
  type Story,
  type UrlSource,
} from "@/domain/editorial";

import { createAssignStory } from "./assign-story";
import type { AssignmentPersistence } from "./assignment-persistence";

const story: Story = {
  id: storyId("story-0028"),
  title: "Assignment Story",
  state: "intake",
  revisionCycle: 0,
  createdAt: "created",
  updatedAt: "created",
};
const writer = (model: AgentProfile["model"] = null): AgentProfile => ({
  id: agentProfileId("writer-0028"),
  role: "writer",
  name: "General Writer",
  instructions: "Write.",
  model,
  builtIn: true,
});

async function setup(profile: AgentProfile = writer()) {
  const stories = createReferenceStoryRepository();
  await stories.persist({ story });
  const profiles = createReferenceAgentProfileRepository([profile]);
  const harness = createReferenceStoryInspectionRepositoryHarness();
  await harness.addStory(story);
  const source: UrlSource = {
    id: sourceId("source-0028"),
    type: "url",
    submittedUrl: "https://example.com",
    canonicalUrl: "https://example.com" as UrlSource["canonicalUrl"],
    submittedBy: { type: "operator", operatorId: operatorId("operator") },
    receivedAt: "received",
  };
  await harness.addSource(source);
  await harness.addAttachment({
    storyId: story.id,
    sourceId: source.id,
    relevance: "Evidence",
    attachedBy: source.submittedBy,
    attachedAt: "attached",
  });
  const inspection = await harness.createRepository();
  const persist = vi.fn<AssignmentPersistence["persist"]>(async (command) => ({
    ok: true,
    assignment: command.assignment,
    story: command.story,
    transitionReceipt: command.transitionReceipt,
  }));
  const workflow = createAssignStory({
    storyRepository: stories,
    agentProfileRepository: profiles,
    inspectionRepository: inspection,
    assignmentPersistence: { persist },
    createAssignmentId: () => assignmentId("assignment-0028"),
    createTransitionId: () => transitionId("transition-0028"),
    now: () => "assigned-at",
  });
  return { workflow, persist };
}

describe("assignStory", () => {
  it("returns STORY_NOT_FOUND before Profile, evidence, or persistence work", async () => {
    const stories = createReferenceStoryRepository();
    const profiles = createReferenceAgentProfileRepository([writer()]);
    const inspection = await createReferenceStoryInspectionRepositoryHarness().createRepository();
    const persist = vi.fn<AssignmentPersistence["persist"]>();
    const workflow = createAssignStory({
      storyRepository: stories,
      agentProfileRepository: profiles,
      inspectionRepository: inspection,
      assignmentPersistence: { persist },
      createAssignmentId: () => assignmentId("unused"),
      createTransitionId: () => transitionId("unused"),
      now: () => "unused",
    });
    await expect(
      workflow({
        storyId: storyId("missing"),
        writerProfileId: writer().id,
        angle: "Angle",
        brief: "Brief",
        constraints: null,
        reason: "Reason",
        assignedBy: { type: "operator", operatorId: operatorId("operator") },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "STORY_NOT_FOUND" } });
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([null, { provider: "configured", model: "writer-model" }] as const)(
    "constructs and persists the authoritative evidence snapshot without model execution",
    async (model) => {
      const { workflow, persist } = await setup(writer(model));
      const result = await workflow({
        storyId: story.id,
        writerProfileId: writer().id,
        angle: "Angle",
        brief: "Brief",
        constraints: null,
        reason: "Ready for assignment",
        assignedBy: { type: "operator", operatorId: operatorId("operator") },
      });
      expect(result).toMatchObject({
        ok: true,
        assignment: { sourceIds: [sourceId("source-0028")], assignedAt: "assigned-at" },
        story: { state: "assigned", updatedAt: "assigned-at" },
        transitionReceipt: {
          previousState: "intake",
          nextState: "assigned",
          reason: "Ready for assignment",
          occurredAt: "assigned-at",
        },
      });
      expect(persist).toHaveBeenCalledOnce();
    },
  );

  it("returns stable missing and non-writer Profile failures before persistence", async () => {
    const missing = await setup();
    await expect(
      missing.workflow({
        storyId: story.id,
        writerProfileId: agentProfileId("missing"),
        angle: "Angle",
        brief: "Brief",
        constraints: null,
        reason: "Reason",
        assignedBy: { type: "operator", operatorId: operatorId("operator") },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "AGENT_PROFILE_NOT_FOUND" } });
    const editor = await setup({ ...writer(), role: "assignment_editor" });
    await expect(
      editor.workflow({
        storyId: story.id,
        writerProfileId: writer().id,
        angle: "Angle",
        brief: "Brief",
        constraints: null,
        reason: "Reason",
        assignedBy: { type: "operator", operatorId: operatorId("operator") },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "AGENT_PROFILE_NOT_WRITER" } });
    expect(missing.persist).not.toHaveBeenCalled();
    expect(editor.persist).not.toHaveBeenCalled();
  });

  it("uses the existing transition rule to require a reason and never persists a failed transition", async () => {
    const { workflow, persist } = await setup({
      ...writer(),
      builtIn: false,
      name: "Custom Writer",
    });
    await expect(
      workflow({
        storyId: story.id,
        writerProfileId: writer().id,
        angle: "Angle",
        brief: "Brief",
        constraints: null,
        reason: " ",
        assignedBy: { type: "operator", operatorId: operatorId("operator") },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "REASON_REQUIRED", previousState: "intake", nextState: "assigned" },
    });
    expect(persist).not.toHaveBeenCalled();
  });
});
