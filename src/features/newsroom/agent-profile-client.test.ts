// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { agentProfileClient, createAgentProfileClient } from "./agent-profile-client";

const profile = {
  id: "profile-client-0027",
  role: "writer",
  name: "Client Writer",
  instructions: "Use supplied evidence.",
  model: null,
  builtIn: false,
} as const;

const response = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

const BUILT_IN_PROFILES_RESPONSE = {
  ok: true,
  profiles: [
    {
      id: "storyrail-assignment-editor-v1",
      role: "assignment_editor",
      name: "Assignment Editor",
      instructions:
        "Assess evidence and editorial value, choose a bounded disposition, and prepare a focused assignment without exceeding the available evidence.",
      model: null,
      builtIn: true,
    },
    {
      id: "storyrail-general-writer-v1",
      role: "writer",
      name: "General Writer",
      instructions:
        "Produce original editorial work within the assignment scope, grounded in the supplied evidence, and never invent unsupported facts.",
      model: null,
      builtIn: true,
    },
    {
      id: "storyrail-director-v1",
      role: "editor_in_chief",
      name: "Director",
      instructions:
        "Independently review work against its assignment and evidence, then approve or request changes within StoryRail's bounded review policy.",
      model: null,
      builtIn: true,
    },
  ],
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agent-profile-client", () => {
  it("accepts the exact durable built-in GET response through the default browser client", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(200, BUILT_IN_PROFILES_RESPONSE));
    vi.stubGlobal("fetch", fetch);

    await expect(agentProfileClient.listProfiles()).resolves.toEqual({
      kind: "completed",
      value: BUILT_IN_PROFILES_RESPONSE.profiles,
    });
    expect(BUILT_IN_PROFILES_RESPONSE.profiles.map(({ role }) => role)).toEqual([
      "assignment_editor",
      "writer",
      "editor_in_chief",
    ]);
    expect(BUILT_IN_PROFILES_RESPONSE.profiles.every(({ model }) => model === null)).toBe(true);
    expect(BUILT_IN_PROFILES_RESPONSE.profiles.every(({ builtIn }) => builtIn)).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/agent-profiles", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });

  it("loads authoritative profiles and accepts truthful model-null and configured models", async () => {
    const configured = {
      ...profile,
      id: "configured",
      model: { provider: "provider", model: "id" },
    };
    const fetch = vi
      .fn()
      .mockResolvedValue(response(200, { ok: true, profiles: [profile, configured] }));

    await expect(createAgentProfileClient({ fetch }).listProfiles()).resolves.toEqual({
      kind: "completed",
      value: [profile, configured],
    });
    expect(fetch).toHaveBeenCalledWith("/api/agent-profiles", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });

  it("posts exactly operator-owned profile configuration", async () => {
    const fetch = vi.fn().mockResolvedValue(response(201, { ok: true, profile }));
    const configuration = {
      name: "Client Writer",
      instructions: "Use supplied evidence.",
      model: null,
    };

    await expect(
      createAgentProfileClient({ fetch }).createWriterProfile(configuration),
    ).resolves.toEqual({
      kind: "completed",
      value: profile,
    });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual(configuration);
    expect(String(init.body)).not.toMatch(/builtIn|role|profile-client-0027/);
  });

  it.each([
    { ...profile, role: "fact_checker" },
    { ...profile, name: " " },
    { ...profile, model: { provider: "provider" } },
    { ...profile, unexpected: true },
  ])("fails closed for malformed durable profile %#", async (malformed) => {
    const fetch = vi.fn().mockResolvedValue(response(200, { ok: true, profiles: [malformed] }));
    await expect(createAgentProfileClient({ fetch }).listProfiles()).resolves.toMatchObject({
      kind: "unavailable",
    });
  });

  it("does not invent persistence when create fails", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      createAgentProfileClient({ fetch }).createWriterProfile({
        name: profile.name,
        instructions: profile.instructions,
        model: null,
      }),
    ).resolves.toMatchObject({ kind: "unavailable" });
  });
});
