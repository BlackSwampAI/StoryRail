// @vitest-environment node

import { STORY_STATES, siteId } from "@/domain/editorial";
import { describe, expect, it, vi } from "vitest";

import {
  createStoryClient,
  STORY_REQUEST_UNAVAILABLE_MESSAGE,
  type StoryClientDependencies,
} from "./story-client";

const SITE_ID = siteId("site-second");

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
const SUCCESSFUL_EXTRACTION = {
  id: "extraction-success-0023",
  sourceId: SOURCE.id,
  extractor: { key: "controlled", version: "1" },
  requestedBy: { type: "operator", operatorId: "operator-0021" },
  startedAt: "opaque-started",
  completedAt: "opaque-completed",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Exact persisted Markdown\n\n  Spacing remains.  ",
    title: "Persisted evidence",
    byline: null,
    publishedAt: null,
    language: "en",
  },
} as const;
const FAILED_EXTRACTION = {
  id: "extraction-failed-0023",
  sourceId: SOURCE.id,
  extractor: { key: "controlled", version: "1" },
  requestedBy: { type: "agent", role: "fact_checker", runId: "run-0023" },
  startedAt: "opaque-failed-started",
  completedAt: "opaque-failed-completed",
  outcome: "failed",
  failure: { code: "RETRIEVAL_FAILED", retryable: true },
} as const;
const PREPARATION = {
  id: "preparation-success-0025",
  sourceId: SOURCE.id,
  extractionId: SUCCESSFUL_EXTRACTION.id,
  model: { provider: "openrouter", model: "operator/model" },
  preparer: { key: "storyrail_evidence_preparer", version: "1" },
  input: { rawCharacters: 512, submittedCharacters: 512 },
  requestedBy: { type: "operator", operatorId: "operator-0021" },
  startedAt: "opaque-preparation-started",
  completedAt: "opaque-preparation-completed",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Exact prepared Markdown",
    title: null,
    byline: null,
    publishedAt: "opaque-prepared-published",
    language: null,
  },
} as const;
const INSPECTION = {
  story: STORY,
  sources: [
    {
      attachment: ATTACHMENT,
      source: SOURCE,
      extractions: [SUCCESSFUL_EXTRACTION, FAILED_EXTRACTION],
      preparations: [PREPARATION],
    },
  ],
  assignment: null,
  transitions: [],
  agentRuns: [],
  reviewDecisions: [],
  deliveries: [],
  article: null,
};
const AGENT_RUN = {
  id: "run-0030",
  storyId: STORY.id,
  profileId: "storyrail-assignment-editor-v1",
  role: "assignment_editor",
  operation: "assignment_proposal",
  model: { provider: "openrouter", model: "provider/model" },
  prompt: { key: "storyrail_assignment_editor", version: "1" },
  requestedBy: { type: "operator", operatorId: "operator-0030" },
  startedAt: "opaque-started",
  completedAt: "opaque-completed",
  input: {
    story: { id: STORY.id, title: STORY.title, state: "intake", revisionCycle: 0 },
    evidence: [
      {
        sourceId: SOURCE.id,
        relevance: ATTACHMENT.relevance,
        evidenceKind: "prepared",
        evidenceId: PREPARATION.id,
      },
    ],
    unavailableSourceIds: [],
    writerProfileIds: ["storyrail-general-writer-v1"],
  },
  outcome: "succeeded",
  proposal: {
    writerProfileId: "storyrail-general-writer-v1",
    angle: "Focused angle",
    brief: "Bounded brief",
    constraints: null,
    reason: "Best fit",
  },
} as const;

const RESEARCHER_RUN = {
  id: "research-run-0033",
  storyId: STORY.id,
  profileId: "storyrail-researcher-v1",
  role: "researcher",
  operation: "source_research",
  model: { provider: "openrouter", model: "provider/model" },
  prompt: { key: "storyrail_researcher", version: "1" },
  requestedBy: { type: "operator", operatorId: "operator-0033" },
  startedAt: "opaque-started",
  completedAt: "opaque-completed",
  input: {
    story: { id: STORY.id, title: STORY.title, state: "intake", revisionCycle: 0 },
    evidence: [],
    unavailableSourceIds: [],
  },
} as const;

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("story-client", () => {
  it("reads back a run an agent in the Researcher role requested", async () => {
    const run = {
      ...AGENT_RUN,
      requestedBy: { type: "agent", role: "researcher", runId: "research-run-0031" },
    };
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [run] } }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
    ).resolves.toEqual({
      kind: "completed",
      value: { ...INSPECTION, agentRuns: [run] },
    });
  });

  it("reads back a Researcher run in each outcome the domain allows", async () => {
    const common = {
      id: "research-run-0032",
      storyId: STORY.id,
      profileId: "storyrail-researcher-v1",
      role: "researcher",
      operation: "source_research",
      model: { provider: "openrouter", model: "provider/model" },
      prompt: { key: "storyrail_researcher", version: "1" },
      requestedBy: { type: "operator", operatorId: "operator-0032" },
      startedAt: "opaque-started",
      input: {
        story: { id: STORY.id, title: STORY.title, state: "intake", revisionCycle: 0 },
        evidence: [
          {
            sourceId: SOURCE.id,
            relevance: ATTACHMENT.relevance,
            evidenceKind: "prepared",
            evidenceId: PREPARATION.id,
          },
        ],
        unavailableSourceIds: [],
      },
    } as const;
    const runs = [
      { ...common, completedAt: null, outcome: "running" },
      {
        ...common,
        completedAt: "opaque-completed",
        outcome: "succeeded",
        attached: [
          { sourceId: "source-found", url: "https://example.com/found", relevance: "Why it fits" },
        ],
      },
      {
        ...common,
        completedAt: "opaque-completed",
        outcome: "failed",
        failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
      },
    ];

    for (const run of runs) {
      const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
        response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [run] } }),
      );

      await expect(
        createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
      ).resolves.toEqual({
        kind: "completed",
        value: { ...INSPECTION, agentRuns: [run] },
      });
    }
  });

  it("reads back a Researcher run that attached nothing as a complete run", async () => {
    const run = {
      ...RESEARCHER_RUN,
      outcome: "succeeded",
      attached: [],
    };
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [run] } }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
    ).resolves.toEqual({
      kind: "completed",
      value: { ...INSPECTION, agentRuns: [run] },
    });
  });

  it("refuses a Researcher run carrying a key the domain does not record", async () => {
    const run = {
      ...RESEARCHER_RUN,
      outcome: "succeeded",
      attached: [],
      searchProvider: "an-unrecorded-extra",
    };
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [run] } }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
    ).resolves.toEqual({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    });
  });

  it("reads back a Story in every state the domain allows", async () => {
    for (const state of STORY_STATES) {
      const story = { ...STORY, state };
      const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
        response(200, { ok: true, inspection: { ...INSPECTION, story } }),
      );

      await expect(
        createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
      ).resolves.toEqual({
        kind: "completed",
        value: { ...INSPECTION, story },
      });
    }
  });

  it("sends the exact listing GET and parses complete and empty listings", async () => {
    const opaqueStory = { ...STORY, createdAt: "opaque-created", updatedAt: "opaque-updated" };
    const fetch = vi
      .fn<StoryClientDependencies["fetch"]>()
      .mockResolvedValueOnce(
        response(200, { ok: true, stories: [{ story: opaqueStory, sourceCount: 3 }] }),
      )
      .mockResolvedValueOnce(response(200, { ok: true, stories: [] }));
    const client = createStoryClient({ siteId: SITE_ID, fetch });

    await expect(client.listStories()).resolves.toEqual({
      kind: "completed",
      value: [{ story: opaqueStory, sourceCount: 3 }],
    });
    await expect(client.listStories()).resolves.toEqual({ kind: "completed", value: [] });
    expect(fetch.mock.calls).toEqual([
      [
        "/api/sites/site-second/stories",
        { method: "GET", headers: { Accept: "application/json" } },
      ],
      [
        "/api/sites/site-second/stories",
        { method: "GET", headers: { Accept: "application/json" } },
      ],
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
    await expect(createStoryClient({ siteId: SITE_ID, fetch }).listStories()).resolves.toEqual({
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
    const client = createStoryClient({ siteId: SITE_ID, fetch });

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
        "/api/sites/site-second/stories",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ title: STORY.title }),
        },
      ],
      [
        `/api/sites/site-second/stories/${STORY.id}/sources`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ sourceId: SOURCE.id, relevance: ATTACHMENT.relevance }),
        },
      ],
      [
        `/api/sites/site-second/stories/${STORY.id}`,
        { method: "GET", headers: { Accept: "application/json" } },
      ],
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
          extractions: [
            {
              ...SUCCESSFUL_EXTRACTION,
              startedAt: "opaque-extraction-started",
              completedAt: "opaque-extraction-completed",
              document: { ...SUCCESSFUL_EXTRACTION.document, publishedAt: "opaque-published" },
            },
          ],
          preparations: [],
        },
      ],
      assignment: null,
      transitions: [],
      agentRuns: [],
      reviewDecisions: [],
      deliveries: [],
      article: null,
    };
    const timestamps = [
      opaqueInspection.story.createdAt,
      opaqueInspection.story.updatedAt,
      opaqueInspection.sources[0].source.receivedAt,
      opaqueInspection.sources[0].attachment.attachedAt,
      opaqueInspection.sources[0].extractions[0].startedAt,
      opaqueInspection.sources[0].extractions[0].completedAt,
      opaqueInspection.sources[0].extractions[0].document.publishedAt,
    ];
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, { ok: true, inspection: opaqueInspection }),
    );

    expect(timestamps.every((timestamp) => Number.isNaN(Date.parse(timestamp)))).toBe(true);
    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
    ).resolves.toEqual({
      kind: "completed",
      value: opaqueInspection,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "a claim that cites nothing",
      [{ kind: "claim", markdown: "An unsupported assertion.", citations: [] }],
    ],
    [
      "attribution on prose that claims nothing",
      [
        {
          kind: "context",
          markdown: "Connective prose.",
          citations: [{ sourceId: "s", evidenceId: "e", quote: "Quoted" }],
        },
      ],
    ],
    ["an unknown block kind", [{ kind: "footnote", markdown: "Text", citations: [] }]],
    ["an empty block list", []],
  ])("refuses an Article Revision carrying %s", async (_label, blocks) => {
    // The workspace treats an inspection it cannot validate as unavailable rather than
    // rendering an Article whose grounding claims do not hold together.
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, {
        ok: true,
        inspection: {
          ...INSPECTION,
          article: {
            article: {
              id: "article-client",
              storyId: STORY.id,
              assignmentId: "assignment-client",
              createdAt: "drafted",
            },
            revisions: [
              {
                id: "revision-client",
                articleId: "article-client",
                revisionNumber: 1,
                writerProfileId: "writer-client",
                agentRunId: "run-client",
                headline: "Headline",
                dek: null,
                blocks,
                createdBy: { type: "agent", role: "writer", runId: "run-client" },
                createdAt: "drafted",
              },
            ],
          },
        },
      }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
    ).resolves.toMatchObject({
      kind: "unavailable",
    });
  });

  it("parses zero extractions, exact Markdown, nullable metadata, and failed evidence", async () => {
    const inspections = [
      {
        story: STORY,
        sources: [{ attachment: ATTACHMENT, source: SOURCE, extractions: [], preparations: [] }],
        assignment: null,
        transitions: [],
        agentRuns: [],
        reviewDecisions: [],
        deliveries: [],
        article: null,
      },
      INSPECTION,
    ];
    const fetch = vi
      .fn<StoryClientDependencies["fetch"]>()
      .mockResolvedValueOnce(response(200, { ok: true, inspection: inspections[0] }))
      .mockResolvedValueOnce(response(200, { ok: true, inspection: inspections[1] }));
    const client = createStoryClient({ siteId: SITE_ID, fetch });

    await expect(client.inspectStory(STORY.id)).resolves.toEqual({
      kind: "completed",
      value: inspections[0],
    });
    await expect(client.inspectStory(STORY.id)).resolves.toEqual({
      kind: "completed",
      value: inspections[1],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    { attachment: ATTACHMENT, source: SOURCE },
    { attachment: ATTACHMENT, source: SOURCE, extractions: {}, preparations: [] },
    {
      attachment: ATTACHMENT,
      source: SOURCE,
      extractions: [
        {
          ...SUCCESSFUL_EXTRACTION,
          document: { ...SUCCESSFUL_EXTRACTION.document, content: 42 },
        },
      ],
      preparations: [],
    },
    {
      attachment: ATTACHMENT,
      source: SOURCE,
      extractions: [{ ...FAILED_EXTRACTION, failure: { code: "INVENTED", retryable: true } }],
      preparations: [],
    },
    {
      attachment: ATTACHMENT,
      source: SOURCE,
      extractions: [{ ...FAILED_EXTRACTION, sourceId: "another-source" }],
      preparations: [],
    },
  ])("rejects malformed extraction entry %# without retry", async (sourceEntry) => {
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, {
        ok: true,
        inspection: {
          story: STORY,
          sources: [sourceEntry],
          assignment: null,
          transitions: [],
          agentRuns: [],
          reviewDecisions: [],
          deliveries: [],
          article: null,
        },
      }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
    ).resolves.toEqual({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
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
    const client = createStoryClient({ siteId: SITE_ID, fetch });
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
    const result = await createStoryClient({ siteId: SITE_ID, fetch }).createStory(STORY.title);

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
    const result = await createStoryClient({ siteId: SITE_ID, fetch }).listStories();

    expect(result).toEqual({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("posts the exact bounded Assignment body and strictly accepts all three durable facts", async () => {
    const command = {
      writerProfileId: "storyrail-general-writer-v1",
      angle: "Angle",
      brief: "Brief",
      constraints: null,
      reason: "Ready",
    };
    const assignment = {
      id: "assignment-0028",
      storyId: STORY.id,
      writerProfileId: command.writerProfileId,
      sourceIds: [SOURCE.id],
      angle: command.angle,
      brief: command.brief,
      constraints: null,
      assignedBy: { type: "operator", operatorId: "operator-0028" },
      assignedAt: "opaque-assigned",
    };
    const assignedStory = { ...STORY, state: "assigned", updatedAt: "opaque-assigned" };
    const transitionReceipt = {
      transitionId: "transition-0028",
      storyId: STORY.id,
      previousState: "intake",
      nextState: "assigned",
      actor: assignment.assignedBy,
      reason: command.reason,
      occurredAt: "opaque-assigned",
      revisionCycle: 0,
    };
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(201, { ok: true, assignment, story: assignedStory, transitionReceipt }),
    );
    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).assignStory(STORY.id, command),
    ).resolves.toEqual({
      kind: "completed",
      value: { assignment, story: assignedStory, transitionReceipt },
    });
    expect(fetch).toHaveBeenCalledWith(
      `/api/sites/site-second/stories/${STORY.id}/assignments`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(command),
      }),
    );
  });

  it("fails closed for a malformed Assignment success without inventing completion", async () => {
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(201, { ok: true, assignment: { id: "partial" }, story: STORY }),
    );
    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).assignStory(STORY.id, {
        writerProfileId: "writer",
        angle: "Angle",
        brief: "Brief",
        constraints: null,
        reason: "Reason",
      }),
    ).resolves.toEqual({ kind: "unavailable", message: STORY_REQUEST_UNAVAILABLE_MESSAGE });
  });

  it("posts exactly {} and strictly decodes successful and failed durable AgentRuns", async () => {
    const failed = {
      ...AGENT_RUN,
      outcome: "failed" as const,
      failure: { code: "MODEL_REQUEST_TIMED_OUT" as const, retryable: true },
      proposal: undefined,
    };
    const { proposal: _proposal, ...strictFailed } = failed;
    void _proposal;
    // The endpoint accepts the request and answers with a run identity; the client follows that
    // run by inspecting the Story until it reaches a terminal outcome.
    const fetch = vi
      .fn<StoryClientDependencies["fetch"]>()
      .mockResolvedValueOnce(response(202, { ok: true, runId: AGENT_RUN.id }))
      .mockResolvedValueOnce(
        response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [AGENT_RUN] } }),
      )
      .mockResolvedValueOnce(response(202, { ok: true, runId: strictFailed.id }))
      .mockResolvedValueOnce(
        response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [strictFailed] } }),
      );
    const client = createStoryClient({
      siteId: SITE_ID,
      fetch,
      now: () => 0,
      wait: async () => {},
    });
    await expect(client.generateAssignmentProposal(STORY.id)).resolves.toEqual({
      kind: "completed",
      value: AGENT_RUN,
    });
    await expect(client.generateAssignmentProposal(STORY.id)).resolves.toEqual({
      kind: "completed",
      value: strictFailed,
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `/api/sites/site-second/stories/${STORY.id}/assignment-proposals`,
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `/api/sites/site-second/stories/${STORY.id}`,
      expect.anything(),
    );
  });

  it("keeps following a started run until it stops running", async () => {
    const running = { ...AGENT_RUN, outcome: "running" as const, completedAt: null };
    const { proposal: _proposal, ...inFlight } = running as never as {
      proposal: unknown;
    } & Record<string, unknown>;
    const fetch = vi
      .fn<StoryClientDependencies["fetch"]>()
      .mockResolvedValueOnce(response(202, { ok: true, runId: AGENT_RUN.id }))
      .mockResolvedValueOnce(
        response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [inFlight] } }),
      )
      .mockResolvedValueOnce(
        response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [AGENT_RUN] } }),
      );
    const waited: number[] = [];
    const client = createStoryClient({
      siteId: SITE_ID,
      fetch,
      now: () => 0,
      wait: async (milliseconds) => {
        waited.push(milliseconds);
      },
    });

    await expect(client.generateAssignmentProposal(STORY.id)).resolves.toEqual({
      kind: "completed",
      value: AGENT_RUN,
    });
    expect(waited).toHaveLength(1);
  });

  it("fails closed on a malformed AgentRun but returns expected proposal preconditions", async () => {
    const fetch = vi
      .fn<StoryClientDependencies["fetch"]>()
      .mockResolvedValueOnce(response(201, { ok: true, run: { ...AGENT_RUN, extra: true } }))
      .mockResolvedValueOnce(
        response(422, {
          ok: false,
          error: {
            code: "ASSIGNMENT_EDITOR_EVIDENCE_REQUIRED",
            message: "Evidence required.",
          },
        }),
      );
    const client = createStoryClient({ siteId: SITE_ID, fetch });
    await expect(client.generateAssignmentProposal(STORY.id)).resolves.toEqual({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    });
    await expect(client.generateAssignmentProposal(STORY.id)).resolves.toMatchObject({
      kind: "application-failure",
      error: { code: "ASSIGNMENT_EDITOR_EVIDENCE_REQUIRED" },
    });
  });

  it("reads back a correction that went out of scope, findings and all", async () => {
    // The domain and the database both allow findings on either grounding refusal. This validator
    // named only one of them, so a Story whose Writer went out of scope could not be inspected at
    // all: the run was refused here and the whole inspection reported unavailable. Observed live —
    // the Story became unopenable after three such runs.
    const findings = [
      {
        blockIndex: 0,
        citationIndex: 0,
        code: "CITATION_QUOTE_UNSUPPORTED",
        quote: "a passage the evidence does not carry",
        evidenceId: "preparation-31",
      },
    ];
    const run = {
      id: "writer-run-out-of-scope",
      storyId: STORY.id,
      profileId: "writer-31",
      role: "writer",
      operation: "article_draft",
      model: { provider: "openrouter", model: "writer-model" },
      prompt: { key: "storyrail_writer_draft", version: "1" },
      requestedBy: { type: "operator", operatorId: "operator" },
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: { id: STORY.id, title: STORY.title, state: "assigned", revisionCycle: 0 },
        assignment: {
          id: "assignment-31",
          storyId: STORY.id,
          writerProfileId: "writer-31",
          sourceIds: ["source-31"],
          angle: "Angle",
          brief: "Brief",
          constraints: null,
        },
        evidence: [
          {
            sourceId: "source-31",
            relevance: "Primary",
            evidenceKind: "prepared",
            evidenceId: "preparation-31",
          },
        ],
        unavailableSourceIds: [],
      },
      outcome: "failed",
      failure: { code: "MODEL_CORRECTION_OUT_OF_SCOPE", retryable: true, findings },
    };
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [run] } }),
    );
    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
    ).resolves.toEqual({
      kind: "completed",
      value: { ...INSPECTION, agentRuns: [run] },
    });
  });

  it("still refuses findings attached to a failure that is not about grounding", async () => {
    const run = {
      id: "writer-run-mislabelled",
      storyId: STORY.id,
      profileId: "writer-31",
      role: "writer",
      operation: "article_draft",
      model: { provider: "openrouter", model: "writer-model" },
      prompt: { key: "storyrail_writer_draft", version: "1" },
      requestedBy: { type: "operator", operatorId: "operator" },
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: { id: STORY.id, title: STORY.title, state: "assigned", revisionCycle: 0 },
        assignment: {
          id: "assignment-31",
          storyId: STORY.id,
          writerProfileId: "writer-31",
          sourceIds: ["source-31"],
          angle: "Angle",
          brief: "Brief",
          constraints: null,
        },
        evidence: [
          {
            sourceId: "source-31",
            relevance: "Primary",
            evidenceKind: "prepared",
            evidenceId: "preparation-31",
          },
        ],
        unavailableSourceIds: [],
      },
      outcome: "failed",
      failure: {
        code: "MODEL_REQUEST_TIMED_OUT",
        retryable: true,
        findings: [
          {
            blockIndex: 0,
            citationIndex: 0,
            code: "CITATION_QUOTE_UNSUPPORTED",
            quote: "a passage the evidence does not carry",
            evidenceId: "preparation-31",
          },
        ],
      },
    };
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [run] } }),
    );
    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
    ).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("posts exactly {} for Writer execution and decodes its durable failed run", async () => {
    const run = {
      id: "writer-run-31",
      storyId: STORY.id,
      profileId: "writer-31",
      role: "writer",
      operation: "article_draft",
      model: { provider: "openrouter", model: "writer-model" },
      prompt: { key: "storyrail_writer_draft", version: "1" },
      requestedBy: { type: "operator", operatorId: "operator" },
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: { id: STORY.id, title: STORY.title, state: "assigned", revisionCycle: 0 },
        assignment: {
          id: "assignment-31",
          storyId: STORY.id,
          writerProfileId: "writer-31",
          sourceIds: ["source-31"],
          angle: "Angle",
          brief: "Brief",
          constraints: null,
        },
        evidence: [
          {
            sourceId: "source-31",
            relevance: "Primary",
            evidenceKind: "raw",
            evidenceId: "extraction-31",
          },
        ],
        unavailableSourceIds: [],
      },
      outcome: "failed",
      failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
    };
    const fetch = vi
      .fn<StoryClientDependencies["fetch"]>()
      .mockResolvedValueOnce(response(202, { ok: true, runId: run.id }))
      .mockResolvedValueOnce(
        response(200, { ok: true, inspection: { ...INSPECTION, agentRuns: [run] } }),
      );
    await expect(
      createStoryClient({
        siteId: SITE_ID,
        fetch,
        now: () => 0,
        wait: async () => {},
      }).createWriterDraft(STORY.id),
    ).resolves.toEqual({ kind: "completed", value: run });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `/api/sites/site-second/stories/${STORY.id}/writer-drafts`,
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });

  it("uses the focused supervised-review and revision endpoints with exact request bodies", async () => {
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(500, { ok: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Safe." } }),
    );
    const client = createStoryClient({ siteId: SITE_ID, fetch });

    await client.rejectStory(STORY.id, "No longer in scope.");
    await client.submitReview(STORY.id);
    await client.runDirectorReview(STORY.id);
    await client.recordReviewDecision(STORY.id, {
      directorRunId: "director-run-38",
      decision: "request_changes",
      reason: "Support the timeline.",
    });
    await client.createWriterRevision(STORY.id);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `/api/sites/site-second/stories/${STORY.id}/rejections`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "No longer in scope." }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `/api/sites/site-second/stories/${STORY.id}/review-submissions`,
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      `/api/sites/site-second/stories/${STORY.id}/director-reviews`,
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    expect(JSON.parse(String(fetch.mock.calls[3]![1]?.body))).toEqual({
      directorRunId: "director-run-38",
      decision: "request_changes",
      reason: "Support the timeline.",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      `/api/sites/site-second/stories/${STORY.id}/writer-revisions`,
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });

  it("decodes a completed Story rejection and its operator transition receipt", async () => {
    const rejected = { ...STORY, state: "rejected", updatedAt: "rejected" } as const;
    const transitionReceipt = {
      transitionId: "transition-43",
      storyId: STORY.id,
      previousState: "intake",
      nextState: "rejected",
      actor: { type: "operator", operatorId: "operator-43" },
      reason: "No longer in scope.",
      occurredAt: "rejected",
      revisionCycle: 0,
    } as const;
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(201, { ok: true, story: rejected, transitionReceipt }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).rejectStory(STORY.id, transitionReceipt.reason),
    ).resolves.toEqual({
      kind: "completed",
      value: { story: rejected, transitionReceipt },
    });
  });

  it("reads back an inspection carrying deliveries intact", async () => {
    const delivery = {
      id: "delivery-0021",
      storyId: STORY.id,
      revisionId: "revision-0021",
      destination: "wordpress",
      remoteId: "412",
      request: {
        operation: "create",
        slug: "a-real-newsroom-story",
        draft: true,
        bodyCharacters: 640,
      },
      startedAt: "2026-08-25T09:00:00.000Z",
      outcome: "succeeded",
      completedAt: "2026-08-25T09:00:04.000Z",
      result: {
        status: 201,
        message: null,
        requestedSlug: "a-real-newsroom-story",
        assignedSlug: "a-real-newsroom-story-2",
      },
    } as const;
    const inspection = { ...INSPECTION, deliveries: [delivery] };
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, { ok: true, inspection }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
    ).resolves.toEqual({ kind: "completed", value: inspection });
  });

  it("refuses an inspection whose delivery claims success without naming the page", async () => {
    const nameless = {
      id: "delivery-nameless",
      storyId: STORY.id,
      revisionId: "revision-0021",
      destination: "wordpress",
      remoteId: null,
      request: {
        operation: "create",
        slug: "a-real-newsroom-story",
        draft: true,
        bodyCharacters: 640,
      },
      startedAt: "2026-08-25T09:00:00.000Z",
      outcome: "succeeded",
      completedAt: "2026-08-25T09:00:04.000Z",
      result: { status: 201, message: null },
    };
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(200, { ok: true, inspection: { ...INSPECTION, deliveries: [nameless] } }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).inspectStory(STORY.id),
    ).resolves.toEqual({ kind: "unavailable", message: STORY_REQUEST_UNAVAILABLE_MESSAGE });
  });

  it("reports an accepted delivery with the record the newsroom wrote for it", async () => {
    const delivery = {
      id: "delivery-accepted",
      storyId: STORY.id,
      revisionId: "revision-0021",
      destination: "wordpress",
      remoteId: "412",
      request: {
        operation: "update",
        slug: "a-real-newsroom-story",
        draft: false,
        bodyCharacters: 640,
      },
      startedAt: "2026-08-25T09:00:00.000Z",
      outcome: "succeeded",
      completedAt: "2026-08-25T09:00:04.000Z",
      result: { status: 200, message: null },
    } as const;
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(201, { ok: true, delivery }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).deliverStory(STORY.id),
    ).resolves.toEqual({ kind: "delivered", delivery });
    expect(fetch).toHaveBeenCalledWith(`/api/sites/${SITE_ID}/stories/${STORY.id}/deliveries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    });
  });

  it("keeps a delivery the destination refused apart from one that was never attempted", async () => {
    const refused = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(502, {
        ok: false,
        error: { code: "DESTINATION_REJECTED", message: "The destination declined the page." },
      }),
    );
    const neverAttempted = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(503, {
        ok: false,
        error: {
          code: "CREDENTIAL_NOT_CONFIGURED",
          reason: "CREDENTIAL_NOT_CONFIGURED",
          slot: "wordpress_application_password",
          message: "No WordPress credential is configured.",
        },
      }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch: refused }).deliverStory(STORY.id),
    ).resolves.toMatchObject({ kind: "refused", error: { code: "DESTINATION_REJECTED" } });
    await expect(
      createStoryClient({ siteId: SITE_ID, fetch: neverAttempted }).deliverStory(STORY.id),
    ).resolves.toMatchObject({
      kind: "not-attempted",
      error: { code: "CREDENTIAL_NOT_CONFIGURED" },
    });
  });

  it("reports a Story that is not published as a refusal the operator can read", async () => {
    const fetch = vi.fn<StoryClientDependencies["fetch"]>(async () =>
      response(409, {
        ok: false,
        error: {
          code: "STORY_NOT_PUBLISHED",
          message: "Only a published Story is delivered to a destination.",
        },
      }),
    );

    await expect(
      createStoryClient({ siteId: SITE_ID, fetch }).deliverStory(STORY.id),
    ).resolves.toMatchObject({
      kind: "application-failure",
      error: { code: "STORY_NOT_PUBLISHED" },
    });
  });

  it("exports only the focused browser client surface", async () => {
    const exports = await import("./story-client");

    expect(Object.keys(exports).sort()).toEqual([
      "STORY_REQUEST_UNAVAILABLE_MESSAGE",
      "createStoryClient",
    ]);
    expect(exports).not.toHaveProperty("runtime");
    expect(exports).not.toHaveProperty("pool");
    expect(exports).not.toHaveProperty("repository");
    expect(exports).not.toHaveProperty("environment");
  });
});
