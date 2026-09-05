// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { AttachSourceToStoryWorkflowResult } from "@/application/story-source-attachment";
import {
  operatorId,
  sourceId,
  storyId,
  type Story,
  type SourceExtraction,
  type StorySourceAttachment,
  type UrlSource,
} from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import { createAttachSourceToStoryHttpHandler } from "./attach-source-to-story-handler";
import { createCreateStoryHttpHandler } from "./create-story-handler";
import { createInspectStoryHttpHandler } from "./inspect-story-handler";
import { createListStoriesHttpHandler } from "./list-stories-handler";

const STORY_ID = storyId("story-http-0020");
const SOURCE_ID = sourceId("source-http-0020");
const CREATED_AT = "2026-08-09T12:00:00.000Z";
const ATTACHED_AT = "2026-08-09T12:01:00.000Z";
const STORY: Story = Object.freeze({
  id: STORY_ID,
  title: "HTTP-integrated Story",
  state: "intake",
  revisionCycle: 0,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
});
const ATTACHMENT: StorySourceAttachment = Object.freeze({
  storyId: STORY_ID,
  sourceId: SOURCE_ID,
  relevance: "Primary evidence for the Story.",
  attachedBy: { type: "operator" as const, operatorId: operatorId("operator-http-0020") },
  attachedAt: ATTACHED_AT,
});
const SOURCE: UrlSource = Object.freeze({
  id: SOURCE_ID,
  type: "url",
  submittedUrl: "https://example.com/report",
  canonicalUrl: "https://example.com/report" as UrlSource["canonicalUrl"],
  submittedBy: { type: "operator" as const, operatorId: operatorId("operator-http-0020") },
  receivedAt: CREATED_AT,
});
const EXTRACTION = Object.freeze({
  id: "extraction-http-0023" as SourceExtraction["id"],
  sourceId: SOURCE_ID,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: ATTACHMENT.attachedBy,
  startedAt: "opaque-http-started",
  completedAt: "opaque-http-completed",
  outcome: "succeeded",
  document: Object.freeze({
    format: "markdown",
    content: "# HTTP persisted Markdown",
    title: null,
    byline: null,
    publishedAt: null,
    language: "en",
  }),
} satisfies SourceExtraction);
const FAILED_EXTRACTION = Object.freeze({
  id: "extraction-http-failed-0023" as SourceExtraction["id"],
  sourceId: SOURCE_ID,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: ATTACHMENT.attachedBy,
  startedAt: "opaque-http-failed-started",
  completedAt: "opaque-http-failed-completed",
  outcome: "failed",
  failure: Object.freeze({ code: "RETRIEVAL_FAILED", retryable: true }),
} satisfies SourceExtraction);

function makeRuntime(overrides: Partial<StoryRuntime> = {}): StoryRuntime {
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
    assignStory: vi.fn<StoryRuntime["assignStory"]>(),
    rejectStory: vi.fn<StoryRuntime["rejectStory"]>(),
    publishStory: vi.fn(),
    deliverStory: vi.fn<StoryRuntime["deliverStory"]>(),
    listStoryDeliveries: vi.fn<StoryRuntime["listStoryDeliveries"]>(),
    submitStoryReview: vi.fn<StoryRuntime["submitStoryReview"]>(),
    readSiteSettings: vi.fn<StoryRuntime["readSiteSettings"]>(),
    updateSiteSettings: vi.fn<StoryRuntime["updateSiteSettings"]>(),
    setSiteCredential: vi.fn<StoryRuntime["setSiteCredential"]>(),
    removeSiteCredential: vi.fn<StoryRuntime["removeSiteCredential"]>(),
    recordStoryReviewDecision: vi.fn<StoryRuntime["recordStoryReviewDecision"]>(),
    close: vi.fn<StoryRuntime["close"]>(async () => undefined),
    ...overrides,
    resolveLegacyDeliveryMapping:
      overrides.resolveLegacyDeliveryMapping ??
      vi.fn<StoryRuntime["resolveLegacyDeliveryMapping"]>(),
  };
}

describe("createListStoriesHttpHandler", () => {
  it("returns complete Story listing entries and an empty list as successful reads", async () => {
    const listStories = vi
      .fn<StoryRuntime["listStories"]>()
      .mockResolvedValueOnce([{ story: STORY, sourceCount: 1 }])
      .mockResolvedValueOnce([]);
    const handler = createListStoriesHttpHandler({
      getRuntime: () => makeRuntime({ listStories }),
    });
    const request = new Request("http://storyrail.test/api/stories", { method: "GET" });

    const populated = await handler(request);
    const empty = await handler(request);
    expect(populated.status).toBe(200);
    expect(await responseBody(populated)).toEqual({
      ok: true,
      stories: [{ story: STORY, sourceCount: 1 }],
    });
    expect(empty.status).toBe(200);
    expect(await responseBody(empty)).toEqual({ ok: true, stories: [] });
    expect(listStories).toHaveBeenCalledTimes(2);
  });

  it("returns the safe generic Story 500 for construction and listing failures", async () => {
    const failure = new Error("secret database detail");
    const handlers = [
      createListStoriesHttpHandler({
        getRuntime: () => {
          throw failure;
        },
      }),
      createListStoriesHttpHandler({
        getRuntime: () =>
          makeRuntime({
            listStories: vi.fn(async () => {
              throw failure;
            }),
          }),
      }),
    ];
    const request = new Request("http://storyrail.test/api/stories", { method: "GET" });

    for (const handler of handlers) {
      const response = await handler(request);
      const serialized = JSON.stringify(await responseBody(response));
      expect(response.status).toBe(500);
      expect(serialized).toContain("INTERNAL_SERVER_ERROR");
      expect(serialized).not.toContain("secret");
    }
  });
});

function postRequest(path: string, body: string, contentType = "application/json"): Request {
  return new Request(`http://storyrail.test${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

async function responseBody(response: Response): Promise<unknown> {
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json();
}

function attachmentFailure(
  code:
    | "STORY_NOT_FOUND"
    | "SOURCE_NOT_FOUND"
    | "STORY_SOURCE_CONFLICT"
    | "STORY_SOURCE_RELEVANCE_REQUIRED",
): AttachSourceToStoryWorkflowResult {
  switch (code) {
    case "STORY_NOT_FOUND":
      return {
        ok: false,
        error: {
          code,
          message: "The Story referenced by the attachment does not exist.",
          storyId: STORY_ID,
        },
      };
    case "SOURCE_NOT_FOUND":
      return {
        ok: false,
        error: {
          code,
          message: "The Source referenced by the attachment does not exist.",
          sourceId: SOURCE_ID,
        },
      };
    case "STORY_SOURCE_CONFLICT":
      return {
        ok: false,
        error: {
          code,
          message:
            "A different Story-Source attachment for the same Story and Source already exists.",
          storyId: STORY_ID,
          sourceId: SOURCE_ID,
        },
      };
    case "STORY_SOURCE_RELEVANCE_REQUIRED":
      return {
        ok: false,
        error: {
          code,
          message: "A non-empty relevance is required to attach a Source to a Story.",
        },
      };
  }
}

describe("createCreateStoryHttpHandler", () => {
  it("creates a Story from the exact body and returns the complete application result", async () => {
    const createStory = vi.fn<StoryRuntime["createStory"]>(async () => ({
      ok: true,
      story: STORY,
    }));
    const handler = createCreateStoryHttpHandler({
      getRuntime: () => makeRuntime({ createStory }),
    });
    const response = await handler(
      postRequest("/api/stories", JSON.stringify({ title: "HTTP-integrated Story" })),
    );

    expect(response.status).toBe(201);
    expect(await responseBody(response)).toEqual({ ok: true, story: STORY });
    expect(createStory).toHaveBeenCalledWith({ title: "HTTP-integrated Story" });
  });

  it("maps title validation to 422 and Story identity conflict to 409", async () => {
    const createStory = vi
      .fn<StoryRuntime["createStory"]>()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "STORY_TITLE_REQUIRED", message: "A title is required." },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "STORY_ID_CONFLICT", message: "Conflict.", storyId: STORY_ID },
      });
    const handler = createCreateStoryHttpHandler({
      getRuntime: () => makeRuntime({ createStory }),
    });

    const invalid = await handler(postRequest("/api/stories", JSON.stringify({ title: "" })));
    const conflict = await handler(
      postRequest("/api/stories", JSON.stringify({ title: STORY.title })),
    );

    expect(invalid.status).toBe(422);
    expect(conflict.status).toBe(409);
  });

  it("rejects wrong media type, invalid JSON, and every non-exact body shape", async () => {
    const getRuntime = vi.fn<() => StoryRuntime>();
    const handler = createCreateStoryHttpHandler({ getRuntime });
    const requests = [
      postRequest("/api/stories", "{}", "text/plain"),
      postRequest("/api/stories", "{"),
      postRequest("/api/stories", "{}"),
      postRequest("/api/stories", JSON.stringify({ title: 42 })),
      postRequest("/api/stories", JSON.stringify({ title: "Story", extra: true })),
    ];
    const responses = await Promise.all(requests.map((request) => handler(request)));

    expect(responses.map(({ status }) => status)).toEqual([415, 400, 400, 400, 400]);
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it("returns a safe generic 500 for runtime and repository failures", async () => {
    const sensitiveFailure = new Error(
      "postgresql://secret@database/storyrail SELECT * FROM storyrail.stories",
    );
    const constructionHandler = createCreateStoryHttpHandler({
      getRuntime: () => {
        throw sensitiveFailure;
      },
    });
    const repositoryHandler = createCreateStoryHttpHandler({
      getRuntime: () =>
        makeRuntime({
          createStory: vi.fn<StoryRuntime["createStory"]>(async () => {
            throw sensitiveFailure;
          }),
        }),
    });

    for (const handler of [constructionHandler, repositoryHandler]) {
      const response = await handler(
        postRequest("/api/stories", JSON.stringify({ title: STORY.title })),
      );
      const serialized = JSON.stringify(await responseBody(response));
      expect(response.status).toBe(500);
      expect(serialized).toContain("INTERNAL_SERVER_ERROR");
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("SELECT");
    }
  });
});

describe("createAttachSourceToStoryHttpHandler", () => {
  const context = { params: Promise.resolve({ storyId: STORY_ID }) };
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    STORYRAIL_OPERATOR_ID: "operator-http-0020",
  };

  it("passes the path Story, Source, relevance, and configured operator provenance", async () => {
    const attachSourceToStory = vi.fn<StoryRuntime["attachSourceToStory"]>(async () => ({
      ok: true,
      attachment: ATTACHMENT,
    }));
    const handler = createAttachSourceToStoryHttpHandler({
      getRuntime: () => makeRuntime({ attachSourceToStory }),
      environment,
    });
    const response = await handler(
      postRequest(
        `/api/stories/${STORY_ID}/sources`,
        JSON.stringify({ sourceId: SOURCE_ID, relevance: ATTACHMENT.relevance }),
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      ok: true,
      attachment: ATTACHMENT,
    });
    expect(attachSourceToStory).toHaveBeenCalledWith({
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance: ATTACHMENT.relevance,
      attachedBy: { type: "operator", operatorId: operatorId("operator-http-0020") },
    });
  });

  it.each([
    ["STORY_NOT_FOUND", 404],
    ["SOURCE_NOT_FOUND", 404],
    ["STORY_SOURCE_CONFLICT", 409],
    ["STORY_SOURCE_RELEVANCE_REQUIRED", 422],
  ] as const)("maps %s to %i", async (code, expectedStatus) => {
    const attachSourceToStory = vi.fn<StoryRuntime["attachSourceToStory"]>(async () =>
      attachmentFailure(code),
    );
    const handler = createAttachSourceToStoryHttpHandler({
      getRuntime: () => makeRuntime({ attachSourceToStory }),
      environment,
    });
    const response = await handler(
      postRequest(
        `/api/stories/${STORY_ID}/sources`,
        JSON.stringify({ sourceId: SOURCE_ID, relevance: "" }),
      ),
      context,
    );

    expect(response.status).toBe(expectedStatus);
  });

  it("rejects malformed transport and exact-shape violations before runtime access", async () => {
    const getRuntime = vi.fn<() => StoryRuntime>();
    const handler = createAttachSourceToStoryHttpHandler({ getRuntime, environment });
    const requests = [
      postRequest("/api/stories/id/sources", "{}", "text/plain"),
      postRequest("/api/stories/id/sources", "{"),
      postRequest("/api/stories/id/sources", JSON.stringify({ sourceId: SOURCE_ID })),
      postRequest(
        "/api/stories/id/sources",
        JSON.stringify({ sourceId: SOURCE_ID, relevance: "Relevant", storyId: STORY_ID }),
      ),
      postRequest(
        "/api/stories/id/sources",
        JSON.stringify({ sourceId: 2, relevance: "Relevant" }),
      ),
    ];
    const responses = await Promise.all(requests.map((request) => handler(request, context)));

    expect(responses.map(({ status }) => status)).toEqual([415, 400, 400, 400, 400]);
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it.each<NodeJS.ProcessEnv>([
    { NODE_ENV: "test" },
    { NODE_ENV: "test", STORYRAIL_OPERATOR_ID: "   " },
  ])(
    "returns a safe 500 when operator provenance is missing or blank",
    async (invalidEnvironment) => {
      const getRuntime = vi.fn<() => StoryRuntime>();
      const handler = createAttachSourceToStoryHttpHandler({
        getRuntime,
        environment: invalidEnvironment,
      });
      const response = await handler(
        postRequest(
          `/api/stories/${STORY_ID}/sources`,
          JSON.stringify({ sourceId: SOURCE_ID, relevance: ATTACHMENT.relevance }),
        ),
        context,
      );

      expect(response.status).toBe(500);
      expect(getRuntime).not.toHaveBeenCalled();
    },
  );

  it("returns a safe generic 500 for unexpected workflow failures", async () => {
    const handler = createAttachSourceToStoryHttpHandler({
      getRuntime: () =>
        makeRuntime({
          attachSourceToStory: vi.fn<StoryRuntime["attachSourceToStory"]>(async () => {
            throw new Error("secret database connection detail");
          }),
        }),
      environment,
    });
    const response = await handler(
      postRequest(
        `/api/stories/${STORY_ID}/sources`,
        JSON.stringify({ sourceId: SOURCE_ID, relevance: ATTACHMENT.relevance }),
      ),
      context,
    );
    const serialized = JSON.stringify(await responseBody(response));

    expect(response.status).toBe(500);
    expect(serialized).toContain("INTERNAL_SERVER_ERROR");
    expect(serialized).not.toContain("secret");
  });
});

describe("createInspectStoryHttpHandler", () => {
  const context = { params: Promise.resolve({ storyId: STORY_ID }) };

  it("returns a complete existing Story inspection", async () => {
    const inspection = {
      story: STORY,
      sources: [
        { attachment: ATTACHMENT, source: SOURCE, extractions: [EXTRACTION], preparations: [] },
      ],
      assignment: null,
      transitions: [],
      agentRuns: [],
      reviewDecisions: [],
      deliveries: [],
      toolCalls: [],
      article: null,
    };
    const inspectStory = vi.fn<StoryRuntime["inspectStory"]>(async () => ({
      ok: true,
      inspection,
    }));
    const handler = createInspectStoryHttpHandler({
      getRuntime: () => makeRuntime({ inspectStory }),
    });
    const request = new Request(`http://storyrail.test/api/stories/${STORY_ID}`);
    const response = await handler(request, context);

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({ ok: true, inspection });
    expect(inspectStory).toHaveBeenCalledWith(STORY_ID);
  });

  it("preserves an unattached Story's empty sources as a successful 200", async () => {
    const inspectStory = vi.fn<StoryRuntime["inspectStory"]>(async () => ({
      ok: true,
      inspection: {
        story: STORY,
        sources: [],
        assignment: null,
        transitions: [],
        agentRuns: [],
        reviewDecisions: [],
        deliveries: [],
        toolCalls: [],
        article: null,
      },
    }));
    const handler = createInspectStoryHttpHandler({
      getRuntime: () => makeRuntime({ inspectStory }),
    });
    const response = await handler(
      new Request(`http://storyrail.test/api/stories/${STORY_ID}`),
      context,
    );

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      ok: true,
      inspection: {
        story: STORY,
        sources: [],
        assignment: null,
        transitions: [],
        agentRuns: [],
        reviewDecisions: [],
        deliveries: [],
        toolCalls: [],
        article: null,
      },
    });
  });

  it("serializes zero-extraction and failed-extraction Source evidence unchanged", async () => {
    const inspections = [
      {
        story: STORY,
        sources: [{ attachment: ATTACHMENT, source: SOURCE, extractions: [], preparations: [] }],
        assignment: null,
        transitions: [],
        agentRuns: [],
        reviewDecisions: [],
        deliveries: [],
        toolCalls: [],
        article: null,
      },
      {
        story: STORY,
        sources: [
          {
            attachment: ATTACHMENT,
            source: SOURCE,
            extractions: [FAILED_EXTRACTION],
            preparations: [],
          },
        ],
        assignment: null,
        transitions: [],
        agentRuns: [],
        reviewDecisions: [],
        deliveries: [],
        toolCalls: [],
        article: null,
      },
    ] as const;
    const inspectStory = vi
      .fn<StoryRuntime["inspectStory"]>()
      .mockResolvedValueOnce({ ok: true, inspection: inspections[0] })
      .mockResolvedValueOnce({ ok: true, inspection: inspections[1] });
    const handler = createInspectStoryHttpHandler({
      getRuntime: () => makeRuntime({ inspectStory }),
    });

    for (const inspection of inspections) {
      const response = await handler(
        new Request(`http://storyrail.test/api/stories/${STORY_ID}`),
        context,
      );
      expect(response.status).toBe(200);
      expect(await responseBody(response)).toEqual({ ok: true, inspection });
    }
  });

  it("maps a missing Story to 404", async () => {
    const inspectStory = vi.fn<StoryRuntime["inspectStory"]>(async () => ({
      ok: false,
      error: {
        code: "STORY_NOT_FOUND",
        message: "The Story to inspect does not exist.",
        storyId: STORY_ID,
      },
    }));
    const handler = createInspectStoryHttpHandler({
      getRuntime: () => makeRuntime({ inspectStory }),
    });
    const response = await handler(
      new Request(`http://storyrail.test/api/stories/${STORY_ID}`),
      context,
    );

    expect(response.status).toBe(404);
  });

  it("returns a safe generic 500 for unexpected inspection failures", async () => {
    const handler = createInspectStoryHttpHandler({
      getRuntime: () =>
        makeRuntime({
          inspectStory: vi.fn<StoryRuntime["inspectStory"]>(async () => {
            throw new Error("secret SQL diagnostic");
          }),
        }),
    });
    const response = await handler(
      new Request(`http://storyrail.test/api/stories/${STORY_ID}`),
      context,
    );
    const serialized = JSON.stringify(await responseBody(response));

    expect(response.status).toBe(500);
    expect(serialized).toContain("INTERNAL_SERVER_ERROR");
    expect(serialized).not.toContain("secret");
  });
});
