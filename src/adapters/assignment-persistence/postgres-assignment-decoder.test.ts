import { describe, expect, it } from "vitest";

import {
  decodePostgresAssignment,
  decodePostgresTransitionReceipt,
  PostgresAssignmentInvariantError,
} from "./postgres-assignment-decoder";

const actor = { type: "operator", operatorId: "operator-decoder-0028" } as const;
const assignment = {
  id: "assignment-decoder-0028",
  storyId: "story-decoder-0028",
  writerProfileId: "writer-decoder-0028",
  sourceIds: ["source-a", "source-b"],
  angle: "Angle",
  brief: "Brief",
  constraints: null,
  assignedBy: actor,
  assignedAt: "opaque-assigned",
};
const receipt = {
  transitionId: "transition-decoder-0028",
  storyId: assignment.storyId,
  previousState: "intake",
  nextState: "assigned",
  actor,
  reason: "Ready",
  occurredAt: "opaque-assigned",
  revisionCycle: 0,
};

describe("PostgreSQL Assignment decoders", () => {
  it("strictly decodes exact Assignment and generic transition payloads", () => {
    expect(
      decodePostgresAssignment({
        assignment_id: assignment.id,
        story_id: assignment.storyId,
        writer_profile_id: assignment.writerProfileId,
        writer_role: "writer",
        payload: assignment,
      }),
    ).toEqual(assignment);
    expect(
      decodePostgresTransitionReceipt({
        transition_id: receipt.transitionId,
        story_id: receipt.storyId,
        previous_state: receipt.previousState,
        next_state: receipt.nextState,
        revision_cycle: receipt.revisionCycle,
        payload: receipt,
      }),
    ).toEqual(receipt);
  });

  it.each([
    { ...assignment, unexpected: true },
    { ...assignment, sourceIds: ["source-a", "source-a"] },
    { ...assignment, assignedBy: { type: "agent", role: "writer", runId: "run" } },
    { ...assignment, angle: " Angle " },
  ])("rejects malformed Assignment payload %#", (payload) => {
    expect(() =>
      decodePostgresAssignment({
        assignment_id: assignment.id,
        story_id: assignment.storyId,
        writer_profile_id: assignment.writerProfileId,
        writer_role: "writer",
        payload,
      }),
    ).toThrow(PostgresAssignmentInvariantError);
  });

  it.each([
    { ...receipt, unexpected: true },
    { ...receipt, reason: " " },
    { ...receipt, nextState: "invented" },
    { ...receipt, storyId: "different-story" },
  ])("rejects malformed transition payload %#", (payload) => {
    expect(() =>
      decodePostgresTransitionReceipt({
        transition_id: receipt.transitionId,
        story_id: receipt.storyId,
        previous_state: receipt.previousState,
        next_state: receipt.nextState,
        revision_cycle: receipt.revisionCycle,
        payload,
      }),
    ).toThrow(PostgresAssignmentInvariantError);
  });
});
