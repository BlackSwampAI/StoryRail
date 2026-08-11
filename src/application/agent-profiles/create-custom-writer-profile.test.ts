import { describe, expect, it, vi } from "vitest";

import { agentProfileId, type AgentProfile } from "@/domain/editorial";

import { createCreateCustomWriterProfile } from "./create-custom-writer-profile";
import type { AgentProfileRepository } from "./agent-profile-repository";

describe("createCreateCustomWriterProfile", () => {
  it("generates identity, forces custom Writer invariants, validates, and persists", async () => {
    const append = vi.fn<AgentProfileRepository["append"]>(async (profile) => ({
      ok: true,
      profile: structuredClone(profile),
    }));
    const createAgentProfileId = vi.fn(() => agentProfileId("profile-workflow-0027"));
    const workflow = createCreateCustomWriterProfile({
      repository: { append, findById: vi.fn(async () => null), list: vi.fn(async () => []) },
      createAgentProfileId,
    });

    await expect(
      workflow({
        name: " Specialist Writer ",
        instructions: " Stay in scope. ",
        model: { provider: "provider", model: "model" },
      }),
    ).resolves.toEqual({
      ok: true,
      profile: {
        id: agentProfileId("profile-workflow-0027"),
        role: "writer",
        name: "Specialist Writer",
        instructions: "Stay in scope.",
        model: { provider: "provider", model: "model" },
        builtIn: false,
      },
    });
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ role: "writer", builtIn: false }),
    );
    expect(createAgentProfileId).toHaveBeenCalledOnce();
  });

  it("does not persist invalid profile configuration", async () => {
    const append = vi.fn<AgentProfileRepository["append"]>();
    const workflow = createCreateCustomWriterProfile({
      repository: { append, findById: vi.fn(async () => null), list: vi.fn(async () => []) },
      createAgentProfileId: () => agentProfileId("invalid-profile"),
    });

    await expect(
      workflow({ name: " ", instructions: "Instructions", model: null }),
    ).resolves.toMatchObject({ ok: false, error: { code: "AGENT_PROFILE_NAME_REQUIRED" } });
    expect(append).not.toHaveBeenCalled();
  });

  it("returns the repository's authoritative durable profile", async () => {
    const authoritative = {
      id: agentProfileId("authoritative-profile"),
      role: "writer",
      name: "Authoritative Writer",
      instructions: "Authoritative instructions.",
      model: null,
      builtIn: false,
    } satisfies AgentProfile;
    const workflow = createCreateCustomWriterProfile({
      repository: {
        append: vi.fn<AgentProfileRepository["append"]>(async () => ({
          ok: true,
          profile: authoritative,
        })),
        findById: vi.fn(async () => null),
        list: vi.fn(async () => []),
      },
      createAgentProfileId: () => authoritative.id,
    });

    await expect(
      workflow({ name: "Input", instructions: "Input instructions", model: null }),
    ).resolves.toEqual({ ok: true, profile: authoritative });
  });
});
