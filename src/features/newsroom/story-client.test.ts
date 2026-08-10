// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  createStoryClient,
  STORY_REQUEST_UNAVAILABLE_MESSAGE,
  type StoryClientDependencies,
} from "./story-client";

const STORY = {
  id: "story-0021",
  title: "A real newsroom Story",
  state: "intake",
  revisionCycle: 0,
  createdAt: "2026-08-09T21:00:00.000Z",
  updatedAt: "2026-08-09T21:00:00.000Z",
} as const;
const SOURCE = {
  id: "source-0021",
  type: "url",
  submittedUrl: "https://example.com/report",
  canonicalUrl: "https://example.com/report",
  submittedBy: { type: "operator", operatorId: "operator-0021" },
  receivedAt: "2026-08-09T20:00:00.000Z",
} as const;
const ATTACHMENT = {
  storyId: STORY.id,
  sourceId: SOURCE.id,
  relevance: "Documents the reported event.",
  attachedBy: { type: "operator", operatorId: "operator-0021" },
  attachedAt: "2026-08-09T21:01:00.000Z",
} as const;
const INSPECTION = { story: STORY, sources: [{ attachment: ATTACHMENT, source: SOURCE }] };

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("story-client", () => {
  it("sends the exact listing GET and parses complete and empty listings", async () => {
    const opaqueStory = { ...STORY, createdAt: "opaque-created", updatedAt: "opaque-updated" };
    const fetch = vi
      .fn<StoryClientDependencies["fetch"]>()
      .mockResolvedValueOnce(
        response(200, { ok: true, stories: [{ story: opaqueStory, sourceCount: 3 }] }),
      )
      .mockResolvedValueOnce(response(200, { ok: true, stories: [] }));
    const client = createStoryClient({ fetch });

    await expect(client.listStories()).resolves.toEqual({
      kind: "completed",
      value: [{ story: opaqueStory, sourceCount: 3 }],
    });
    await expect(client.listStories()).resolves.toEqual({ kind: "completed", value: [] });
    expect(fetch.mock.calls).toEqual([
      ["/api/stories", { method: "GET", headers: { Accept: "application/json" } }],
      ["/api/stories", { method: "GET", headers: { Accept: "application/json" } }],
    ]);
  });

  it.each([
    { ok: true, stories: [{ story: STORY, sourceCount: -1 }] },
    { ok: true, stories: [{ story: STORY, sourceCount: 1.5 }] },
    { ok: true, stories: [{ story: { id: STORY.id }, sourceCount: 0 }] },
    { ok: true, stories: [{ story: { ...STORY, summary: "invented" }, sourceCount: 0 }] },
    { ok: true, stories: {} },
    { ok: false, stories: [] },
  ])("fails closed for malformed listing response %# without retry", async (body) => {
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () => response(200, body));
    await expect(createStoryClient({ fetch }).listStories()).resolves.toEqual({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("sends the exact create, attach, and inspect requests and parses their complete results", async () => {
    const fetch = vi
      .fn<StoryClientDependencies["fetch"]>()
      .mockResolvedValueOnce(response(201, { ok: true, story: STORY }))
      .mockResolvedValueOnce(response(200, { ok: true, attachment: ATTACHMENT }))
      .mockResolvedValueOnce(response(200, { ok: true, inspection: INSPECTION }));
    const client = createStoryClient({ fetch });

    await expect(client.createStory(STORY.title)).resolves.toEqual({
      kind: "completed",
      value: STORY,
    });
    await expect(client.attachSource(STORY.id, SOURCE.id, ATTACHMENT.relevance)).resolves.toEqual({
      kind: "completed",
      value: ATTACHMENT,
    });
    await expect(client.inspectStory(STORY.id)).resolves.toEqual({
      kind: "completed",
      value: INSPECTION,
    });

    expect(fetch.mock.calls).toEqual([
      [
        "/api/stories",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ title: STORY.title }),
        },
      ],
      [
        `/api/stories/${STORY.id}/sources`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ sourceId: SOURCE.id, relevance: ATTACHMENT.relevance }),
        },
      ],
      [`/api/stories/${STORY.id}`, { method: "GET", headers: { Accept: "application/json" } }],
    ]);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({ title: STORY.title });
    expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body))).toEqual({
      sourceId: SOURCE.id,
      relevance: ATTACHMENT.relevance,
    });
    expect(String(fetch.mock.calls[0]![1]?.body)).not.toMatch(/operator|provenance|actor/i);
    expect(String(fetch.mock.calls[1]![1]?.body)).not.toMatch(/operator|provenance|actor/i);
  });

  it("accepts opaque timestamp strings from the server and domain contract", async () => {
    const opaqueInspection = {
      story: {
        ...STORY,
        createdAt: "opaque-story-created",
        updatedAt: "opaque-story-updated",
      },
      sources: [
        {
          attachment: { ...ATTACHMENT, attachedAt: "opaque-attachment-time" },
          source: { ...SOURCE, receivedAt: "opaque-source-received" },
        },
      ],
    };
    const timestamps = [
      opaqueInspection.story.createdAt,
      opaqueInspection.story.updatedAt,
      opaqueInspection.sources[0].source.receivedAt,
      opaqueInspection.sources[0].attachment.attachedAt,
    ];
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, { ok: true, inspection: opaqueInspection }),
    );

    expect(timestamps.every((timestamp) => Number.isNaN(Date.parse(timestamp)))).toBe(true);
    await expect(createStoryClient({ fetch }).inspectStory(STORY.id)).resolves.toEqual({
      kind: "completed",
      value: opaqueInspection,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ["create", 422, "STORY_TITLE_REQUIRED"],
    ["attach", 409, "STORY_SOURCE_CONFLICT"],
    ["inspect", 404, "STORY_NOT_FOUND"],
  ] as const)("returns the expected %s application failure", async (operation, status, code) => {
    const error = { code, message: "Safe application failure." };
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(status, { ok: false, error }),
    );
    const client = createStoryClient({ fetch });
    const result =
      operation === "create"
        ? await client.createStory(STORY.title)
        : operation === "attach"
          ? await client.attachSource(STORY.id, SOURCE.id, ATTACHMENT.relevance)
          : await client.inspectStory(STORY.id);

    expect(result).toEqual({ kind: "application-failure", error });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ["malformed JSON", () => new Response("{", { status: 201 })],
    ["malformed body", () => response(201, { ok: true, story: { id: STORY.id } })],
    ["unexpected response", () => response(500, { ok: false, error: { message: "secret" } })],
    [
      "unexpected application error",
      () => response(418, { ok: false, error: { code: "RAW_FAILURE", message: "secret" } }),
    ],
  ] as const)("fails closed for %s without retrying", async (_label, makeResponse) => {
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () => makeResponse());
    const result = await createStoryClient({ fetch }).createStory(STORY.title);

    expect(result).toEqual({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("redacts network failure details and never retries", async () => {
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () => {
      throw new Error("postgresql://secret@internal/storyrail");
    });
    const result = await createStoryClient({ fetch }).listStories();

    expect(result).toEqual({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("exports only the focused browser client surface", async () => {
    const exports = await import("./story-client");

    expect(Object.keys(exports).sort()).toEqual([
      "STORY_REQUEST_UNAVAILABLE_MESSAGE",
      "createStoryClient",
      "storyClient",
    ]);
    expect(exports).not.toHaveProperty("runtime");
    expect(exports).not.toHaveProperty("pool");
    expect(exports).not.toHaveProperty("repository");
    expect(exports).not.toHaveProperty("environment");
  });
});
