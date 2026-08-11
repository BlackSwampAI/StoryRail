import { describe, expect, it } from "vitest";

import {
  agentProfileId,
  agentRunId,
  assignmentId,
  createAssignment,
  operatorId,
  sourceId,
  storyId,
  type EditorialActor,
} from "./index";

const base = {
  id: assignmentId("assignment-0028"),
  storyId: storyId("story-0028"),
  writerProfileId: agentProfileId("writer-0028"),
  sourceIds: [sourceId("source-a"), sourceId("source-b")],
  angle: " Focused angle ",
  brief: " Bounded brief ",
  constraints: " No speculation ",
  assignedBy: { type: "operator", operatorId: operatorId("operator-0028") } as const,
  assignedAt: "opaque-assigned-at",
};

describe("createAssignment", () => {
  it("creates a trimmed immutable-shape Assignment for an operator", () => {
    expect(createAssignment(base)).toEqual({
      ok: true,
      assignment: {
        ...base,
        angle: "Focused angle",
        brief: "Bounded brief",
        constraints: "No speculation",
      },
    });
  });

  it("allows null constraints and an Assignment Editor agent", () => {
    expect(
      createAssignment({
        ...base,
        constraints: null,
        assignedBy: { type: "agent", role: "assignment_editor", runId: agentRunId("run-0028") },
      }),
    ).toMatchObject({ ok: true, assignment: { constraints: null } });
  });

  it.each([
    ["writer", "ASSIGNMENT_ACTOR_NOT_ALLOWED"],
    ["editor_in_chief", "ASSIGNMENT_ACTOR_NOT_ALLOWED"],
    ["fact_checker", "ASSIGNMENT_ACTOR_NOT_ALLOWED"],
  ] as const)("rejects a %s agent", (role, code) => {
    const actor: EditorialActor = { type: "agent", role, runId: agentRunId(`run-${role}`) };
    expect(createAssignment({ ...base, assignedBy: actor })).toMatchObject({
      ok: false,
      error: { code },
    });
  });

  it.each([
    [{ angle: " " }, "ASSIGNMENT_ANGLE_REQUIRED"],
    [{ brief: "" }, "ASSIGNMENT_BRIEF_REQUIRED"],
    [{ constraints: "\n" }, "ASSIGNMENT_CONSTRAINTS_INVALID"],
    [{ writerProfileId: agentProfileId("") }, "ASSIGNMENT_WRITER_PROFILE_REQUIRED"],
    [{ sourceIds: [sourceId("same"), sourceId("same")] }, "ASSIGNMENT_SOURCE_DUPLICATE"],
  ] as const)("returns stable validation errors", (override, code) => {
    expect(createAssignment({ ...base, ...override })).toMatchObject({
      ok: false,
      error: { code },
    });
  });
});
