import { describe, expect, it } from "vitest";

import { agentProfileId } from "./types";
import { createAgentProfile } from "./agent-profile";

const base = {
  profileId: agentProfileId("profile-domain-0027"),
  role: "writer",
  name: " General Writer ",
  instructions: " Write only from supported evidence. ",
  model: null,
  builtIn: false,
} as const;

describe("createAgentProfile", () => {
  it.each([
    ["assignment_editor", "Assignment Editor"],
    ["writer", "General Writer"],
    ["editor_in_chief", "Director"],
  ])("constructs a valid built-in %s profile", (role, name) => {
    expect(createAgentProfile({ ...base, role, name, builtIn: true })).toMatchObject({
      ok: true,
      profile: { role, name, builtIn: true, model: null },
    });
  });

  it("constructs a trimmed custom Writer with no model", () => {
    expect(createAgentProfile(base)).toEqual({
      ok: true,
      profile: {
        id: base.profileId,
        role: "writer",
        name: "General Writer",
        instructions: "Write only from supported evidence.",
        model: null,
        builtIn: false,
      },
    });
  });

  it("constructs a custom Writer with a provider-neutral model descriptor", () => {
    expect(
      createAgentProfile({ ...base, model: { provider: " provider ", model: " model/id " } }),
    ).toMatchObject({
      ok: true,
      profile: { model: { provider: "provider", model: "model/id" } },
    });
  });

  it.each([
    [{ ...base, name: " " }, "AGENT_PROFILE_NAME_REQUIRED"],
    [{ ...base, instructions: "\n" }, "AGENT_PROFILE_INSTRUCTIONS_REQUIRED"],
    [{ ...base, role: "fact_checker" }, "AGENT_PROFILE_ROLE_UNSUPPORTED"],
    [{ ...base, model: { provider: "provider" } }, "AGENT_PROFILE_MODEL_INVALID"],
    [
      { ...base, model: { provider: " ", model: "model" } },
      "AGENT_PROFILE_MODEL_PROVIDER_REQUIRED",
    ],
    [
      { ...base, model: { provider: "provider", model: " " } },
      "AGENT_PROFILE_MODEL_IDENTIFIER_REQUIRED",
    ],
  ])("rejects invalid profile input with %s", (command, code) => {
    expect(createAgentProfile(command)).toMatchObject({ ok: false, error: { code } });
  });
});
