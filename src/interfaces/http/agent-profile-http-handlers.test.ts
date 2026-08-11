// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { agentProfileId, type AgentProfile } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import { createCreateCustomWriterProfileHttpHandler } from "./create-custom-writer-profile-handler";
import { createListAgentProfilesHttpHandler } from "./list-agent-profiles-handler";

const PROFILE = {
  id: agentProfileId("profile-http-0027"),
  role: "writer",
  name: "HTTP Writer",
  instructions: "Use supported facts.",
  model: null,
  builtIn: false,
} satisfies AgentProfile;

function runtime(overrides: Partial<StoryRuntime>): StoryRuntime {
  return overrides as StoryRuntime;
}

function post(body: string, contentType = "application/json") {
  return new Request("http://storyrail.test/api/agent-profiles", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

async function body(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("application/json");
  return response.json();
}

describe("Agent Profile HTTP handlers", () => {
  it("GET lists durable profiles and empty state", async () => {
    const listAgentProfiles = vi
      .fn<StoryRuntime["listAgentProfiles"]>()
      .mockResolvedValueOnce([PROFILE])
      .mockResolvedValueOnce([]);
    const handler = createListAgentProfilesHttpHandler({
      getRuntime: () => runtime({ listAgentProfiles }),
    });
    await expect(body(await handler())).resolves.toEqual({ ok: true, profiles: [PROFILE] });
    await expect(body(await handler())).resolves.toEqual({ ok: true, profiles: [] });
  });

  it("POST creates only a custom Writer from the exact operator configuration", async () => {
    const createCustomWriterProfile = vi.fn<StoryRuntime["createCustomWriterProfile"]>(
      async () => ({
        ok: true,
        profile: PROFILE,
      }),
    );
    const handler = createCreateCustomWriterProfileHttpHandler({
      getRuntime: () => runtime({ createCustomWriterProfile }),
    });
    const requestBody = {
      name: "HTTP Writer",
      instructions: "Use supported facts.",
      model: { provider: "provider", model: "model-id" },
    };
    const response = await handler(post(JSON.stringify(requestBody)));

    expect(response.status).toBe(201);
    await expect(body(response)).resolves.toEqual({ ok: true, profile: PROFILE });
    expect(createCustomWriterProfile).toHaveBeenCalledWith(requestBody);
  });

  it.each([
    ["text/plain", "{}"],
    ["application/json", "{"],
    ["application/json", JSON.stringify({ name: "Writer", instructions: "Instructions" })],
    [
      "application/json",
      JSON.stringify({
        name: "Writer",
        instructions: "Instructions",
        model: null,
        role: "writer",
      }),
    ],
    [
      "application/json",
      JSON.stringify({ name: "Writer", instructions: "Instructions", model: null, id: "chosen" }),
    ],
    [
      "application/json",
      JSON.stringify({
        name: "Writer",
        instructions: "Instructions",
        model: null,
        builtIn: false,
      }),
    ],
    [
      "application/json",
      JSON.stringify({ name: "Writer", instructions: "Instructions", model: { provider: "only" } }),
    ],
  ])(
    "rejects unsupported media, invalid JSON, or non-exact client authority",
    async (type, value) => {
      const getRuntime = vi.fn<() => StoryRuntime>();
      const response = await createCreateCustomWriterProfileHttpHandler({ getRuntime })(
        post(value, type),
      );
      expect([400, 415]).toContain(response.status);
      expect(getRuntime).not.toHaveBeenCalled();
    },
  );

  it("maps blank configured model values to stable 422 application failures", async () => {
    const createCustomWriterProfile = vi.fn<StoryRuntime["createCustomWriterProfile"]>(
      async () => ({
        ok: false,
        error: {
          code: "AGENT_PROFILE_MODEL_IDENTIFIER_REQUIRED",
          message: "A model identifier is required.",
        },
      }),
    );
    const response = await createCreateCustomWriterProfileHttpHandler({
      getRuntime: () => runtime({ createCustomWriterProfile }),
    })(
      post(
        JSON.stringify({
          name: "Writer",
          instructions: "Instructions",
          model: { provider: "provider", model: " " },
        }),
      ),
    );
    expect(response.status).toBe(422);
    await expect(body(response)).resolves.toMatchObject({
      ok: false,
      error: { code: "AGENT_PROFILE_MODEL_IDENTIFIER_REQUIRED" },
    });
  });

  it("maps an application-generated identity collision to 409", async () => {
    const response = await createCreateCustomWriterProfileHttpHandler({
      getRuntime: () =>
        runtime({
          createCustomWriterProfile: vi.fn<StoryRuntime["createCustomWriterProfile"]>(async () => ({
            ok: false,
            error: {
              code: "AGENT_PROFILE_ID_CONFLICT",
              message: "A different Agent Profile with the same ID already exists.",
              profileId: PROFILE.id,
            },
          })),
        }),
    })(post(JSON.stringify({ name: "Writer", instructions: "Instructions", model: null })));
    expect(response.status).toBe(409);
  });

  it("returns safe 500 responses for unexpected list and create failures", async () => {
    const secret = new Error("secret database detail");
    const responses = [
      await createListAgentProfilesHttpHandler({
        getRuntime: () => {
          throw secret;
        },
      })(),
      await createCreateCustomWriterProfileHttpHandler({
        getRuntime: () =>
          runtime({
            createCustomWriterProfile: vi.fn(async () => {
              throw secret;
            }),
          }),
      })(post(JSON.stringify({ name: "Writer", instructions: "Instructions", model: null }))),
    ];
    for (const response of responses) {
      const serialized = JSON.stringify(await body(response));
      expect(response.status).toBe(500);
      expect(serialized).toContain("INTERNAL_SERVER_ERROR");
      expect(serialized).not.toContain("secret");
    }
  });
});
