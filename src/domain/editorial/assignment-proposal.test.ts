import { describe, expect, it } from "vitest";

import { agentProfileId } from "./types";
import { createAssignmentProposal } from "./assignment-proposal";

const valid = {
  writerProfileId: agentProfileId("writer-0030"),
  angle: "  A focused angle  ",
  brief: "  A bounded brief  ",
  constraints: "  Cite supplied evidence  ",
  reason: "  Best fit for this coverage  ",
};

describe("AssignmentProposal", () => {
  it("constructs a trimmed provider-neutral proposal", () => {
    expect(createAssignmentProposal(valid)).toEqual({
      ok: true,
      proposal: {
        writerProfileId: valid.writerProfileId,
        angle: "A focused angle",
        brief: "A bounded brief",
        constraints: "Cite supplied evidence",
        reason: "Best fit for this coverage",
      },
    });
  });

  it("preserves null constraints", () => {
    expect(createAssignmentProposal({ ...valid, constraints: null })).toMatchObject({
      ok: true,
      proposal: { constraints: null },
    });
  });

  it.each([
    ["writerProfileId", "", "ASSIGNMENT_PROPOSAL_WRITER_PROFILE_REQUIRED"],
    ["angle", " ", "ASSIGNMENT_PROPOSAL_ANGLE_REQUIRED"],
    ["brief", "", "ASSIGNMENT_PROPOSAL_BRIEF_REQUIRED"],
    ["constraints", " ", "ASSIGNMENT_PROPOSAL_CONSTRAINTS_INVALID"],
    ["reason", "", "ASSIGNMENT_PROPOSAL_REASON_REQUIRED"],
  ] as const)("rejects invalid %s", (field, value, code) => {
    expect(createAssignmentProposal({ ...valid, [field]: value })).toMatchObject({
      ok: false,
      error: { code },
    });
  });
});
