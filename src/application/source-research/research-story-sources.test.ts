import { describe, expect, it, vi } from "vitest";

import { settleAgentRun } from "@/test/settle-agent-run";
import type { SourceExtractor } from "@/adapters/source-extraction";
import type { ArchiveRepository } from "@/application/archive";
import type { WebSearchProvider } from "@/application/web-search";
import type { ToolAssistedModel } from "@/application/model";
import {
  agentProfileId,
  agentRunId,
  agentToolCallId,
  operatorId,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
  storyId,
  type AgentProfile,
  type AgentRun,
  type AgentToolCall,
  type NewsroomIdentity,
} from "@/domain/editorial";

import { createResearchStorySources } from "./research-story-sources";

const STORY = storyId("story-research");
const SOURCE = sourceId("source-research");
const PREPARED = sourceEvidencePreparationId("prepared-research");
const OPERATOR = { type: "operator" as const, operatorId: operatorId("operator-research") };
const FOUND = "https://spec.example.test/rfc";

const researcher: AgentProfile = {
  id: agentProfileId("storyrail-researcher-v1"),
  role: "researcher",
  name: "Researcher",
  instructions: "Widen the evidence.",
  model: null,
  builtIn: true,
};

const document = (content: string, title: string | null = "A page") => ({
  format: "markdown" as const,
  content,
  title,
  byline: null,
  publishedAt: null,
  language: null,
});

function inspection(state: "intake" | "assigned" = "intake") {
  return {
    story: {
      id: STORY,
      title: "Story",
      state,
      revisionCycle: 0,
      createdAt: "created",
      updatedAt: "updated",
    },
    sources: [
      {
        attachment: {
          storyId: STORY,
          sourceId: SOURCE,
          relevance: "Primary",
          attachedBy: OPERATOR,
          attachedAt: "attached",
        },
        source: {
          id: SOURCE,
          type: "url" as const,
          submittedUrl: "https://example.test/post",
          canonicalUrl: "https://example.test/post" as never,
          submittedBy: OPERATOR,
          receivedAt: "received",
        },
        extractions: [],
        preparations: [
          {
            id: PREPARED,
            sourceId: SOURCE,
            extractionId: sourceExtractionId("raw-research"),
            model: { provider: "openrouter", model: "prep" },
            preparer: { key: "prep", version: "1" },
            input: { rawCharacters: 30, submittedCharacters: 30 },
            requestedBy: OPERATOR,
            startedAt: "start",
            completedAt: "end",
            outcome: "succeeded" as const,
            document: document("The release cites RFC 1234."),
          },
        ],
      },
    ],
    assignment: null,
    transitions: [],
    agentRuns: [],
    reviewDecisions: [],
    deliveries: [],
    toolCalls: [],
    article: null,
  };
}

function workflow(options: {
  readonly turns: readonly unknown[];
  readonly extract?: SourceExtractor["extract"];
  readonly state?: "intake" | "assigned";
  readonly attachOk?: boolean;
  readonly archive?: ArchiveRepository;
  readonly webSearch?: WebSearchProvider;
  readonly readNewsroomIdentity?: () => Promise<NewsroomIdentity | null>;
  readonly readNewsroomStandards?: () => Promise<string | null>;
  readonly budget?: { readonly maximumCalls: number; readonly maximumTurns: number };
}) {
  const attach = vi.fn(async () => ({ ok: options.attachOk !== false }) as never);
  const completed: AgentRun[] = [];
  const openedCalls: AgentToolCall[] = [];
  const settledCalls: AgentToolCall[] = [];
  const offered: string[][] = [];
  const prompts: string[] = [];
  let turn = 0;
  let ids = 0;
  const run = createResearchStorySources({
    inspections: {
      inspect: vi.fn(async () => ({ ok: true as const, inspection: inspection(options.state) })),
    },
    profiles: {
      findById: vi.fn(async () => researcher),
      findBuiltIn: vi.fn(async () => researcher),
      list: vi.fn(),
      append: vi.fn(),
    },
    runs: {
      append: vi.fn(async (value) => ({ ok: true as const, run: value })),
      complete: vi.fn(async (value) => {
        completed.push(value);
        return { ok: true as const, run: value };
      }),
      listByStoryId: vi.fn(),
    },
    toolCalls: {
      append: vi.fn(async (call) => {
        openedCalls.push(call);
        return { ok: true as const, call };
      }),
      complete: vi.fn(async (call) => {
        settledCalls.push(call);
        return { ok: true as const, call };
      }),
      listByRunId: vi.fn(),
    },
    persistence: { attach },
    archive: options.archive,
    resolveWebSearch: async () => options.webSearch ?? null,
    extractor: {
      descriptor: { key: "test", version: "1" },
      extract:
        options.extract ??
        vi.fn(async () => ({
          ok: true as const,
          document: document("RFC 1234 defines the format."),
        })),
    },
    resolveModel: async () => ({
      ok: true,
      model: {
        descriptor: { provider: "openrouter", model: "researcher" },
        supportsTools: true,
        generateWithTools: vi.fn(
          async (request: { tools: readonly { name: string }[]; systemPrompt: string }) => {
            offered.push(request.tools.map(({ name }) => name));
            prompts.push(request.systemPrompt);
            const next = options.turns[turn];
            turn += 1;
            return next === undefined
              ? {
                  ok: false as const,
                  failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
                }
              : { ok: true as const, output: next };
          },
        ),
      } as unknown as ToolAssistedModel,
    }),
    createAgentRunId: () => agentRunId("run-research"),
    createToolCallId: () => agentToolCallId(`tool-${(ids += 1)}`),
    createSourceId: () => sourceId(`found-${(ids += 1)}`),
    createExtractionId: () => sourceExtractionId(`extraction-${(ids += 1)}`),
    readNewsroomIdentity: options.readNewsroomIdentity,
    readNewsroomStandards: options.readNewsroomStandards,
    readResearchBudget: options.budget === undefined ? undefined : async () => options.budget!,
    now: () => "now",
  });
  return {
    run,
    attach,
    completed,
    offered,
    prompts,
    openedCalls,
    settledCalls,
    turnCount: () => turn,
  };
}

const fetched = {
  kind: "tools" as const,
  calls: [{ callId: "a", name: "fetch_url", arguments: { url: FOUND } }],
};

describe("sending the Researcher out to widen a Story's evidence", () => {
  it("tells the Researcher which newsroom it is finding sources for", async () => {
    // Which sources matter depends on what this publication is for, so the Researcher is told.
    const test = workflow({
      turns: [{ kind: "output", output: { attach: [], reasoning: "Nothing to add." } }],
      readNewsroomIdentity: async () => ({
        name: "Black Swamp AI",
        description: "Guides, Tips and News from the AI World",
      }),
      readNewsroomStandards: async () => "Headlines are sentence case.",
    });

    await settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never);

    expect(test.prompts[0]).toContain("Black Swamp AI");
    expect(test.prompts[0]).toContain("Guides, Tips and News from the AI World");
    expect(test.prompts[0]).toContain("Headlines are sentence case.");
  });

  it("attaches what it retrieved and records which Sources it added", async () => {
    const test = workflow({
      turns: [
        fetched,
        {
          kind: "output",
          output: {
            attach: [{ url: FOUND, relevance: "The specification the release cites." }],
            reasoning: "It is cited.",
          },
        },
      ],
    });

    const result = await settleAgentRun(
      test.run({ storyId: STORY, requestedBy: OPERATOR }) as never,
    );

    expect(result).toMatchObject({
      ok: true,
      run: {
        role: "researcher",
        operation: "source_research",
        outcome: "succeeded",
        attached: [{ url: FOUND, relevance: "The specification the release cites." }],
      },
    });
    expect(test.attach).toHaveBeenCalledOnce();
  });

  it("refuses to attach a page it never retrieved", async () => {
    // An attachment the Researcher merely asserted would be a Source nobody has read.
    const test = workflow({
      turns: [
        {
          kind: "output",
          output: {
            attach: [{ url: "https://invented.example.test/", relevance: "Asserted, not read." }],
            reasoning: "I know this exists.",
          },
        },
      ],
    });

    const result = await settleAgentRun(
      test.run({ storyId: STORY, requestedBy: OPERATOR }) as never,
    );

    expect(result).toMatchObject({ ok: true, run: { outcome: "succeeded", attached: [] } });
    expect(test.attach).not.toHaveBeenCalled();
  });

  it("does not attach a Source the Story already has", async () => {
    const test = workflow({
      turns: [
        {
          kind: "tools",
          calls: [
            { callId: "a", name: "fetch_url", arguments: { url: "https://example.test/post" } },
          ],
        },
        {
          kind: "output",
          output: {
            attach: [{ url: "https://example.test/post", relevance: "Already here." }],
            reasoning: "Again.",
          },
        },
      ],
    });

    const result = await settleAgentRun(
      test.run({ storyId: STORY, requestedBy: OPERATOR }) as never,
    );

    expect(result).toMatchObject({ run: { attached: [] } });
    expect(test.attach).not.toHaveBeenCalled();
  });

  it("treats attaching nothing as a real answer", async () => {
    const test = workflow({
      turns: [
        { kind: "output", output: { attach: [], reasoning: "Nothing further is worth citing." } },
      ],
    });

    await expect(
      settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never),
    ).resolves.toMatchObject({ ok: true, run: { outcome: "succeeded", attached: [] } });
  });

  it("records a failed run rather than leaving it in flight", async () => {
    const test = workflow({ turns: [] });

    await expect(
      settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never),
    ).resolves.toMatchObject({ ok: true, run: { outcome: "failed" } });
    expect(test.attach).not.toHaveBeenCalled();
  });

  it("offers the archive alongside retrieval, and excludes the Story being worked on", async () => {
    const search = vi.fn(async () => [
      {
        storyId: storyId("story-march"),
        revisionId: "revision-march" as never,
        revisionNumber: 1,
        headline: "The newsroom covered this in March",
        dek: null,
        blocks: [{ kind: "context" as const, markdown: "Earlier reporting.", citations: [] }],
        publishedAt: "2026-03-04T10:00:00.000Z",
        sources: [],
      },
    ]);
    const test = workflow({
      archive: { search },
      turns: [
        {
          kind: "tools",
          calls: [{ callId: "a", name: "search_archive", arguments: { query: "x" } }],
        },
        { kind: "output", output: { attach: [], reasoning: "Already covered." } },
      ],
    });

    await settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never);

    expect(test.offered[0]).toEqual(["search_archive", "fetch_url"]);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ excludeStoryId: STORY }));
  });

  it("offers web search to a newsroom that has configured somewhere to search", async () => {
    const test = workflow({
      webSearch: { search: async () => ({ ok: true, results: [] }) },
      turns: [{ kind: "output", output: { attach: [], reasoning: "Nothing to add." } }],
    });

    await settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never);

    expect(test.offered[0]).toEqual(["web_search", "fetch_url"]);
  });

  it("leaves a newsroom with no search instance without the tool", async () => {
    const test = workflow({
      turns: [{ kind: "output", output: { attach: [], reasoning: "Nothing to add." } }],
    });

    await settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never);

    expect(test.offered[0]).not.toContain("web_search");
  });

  it("records the search before the query leaves the process", async () => {
    let openWhenAsked: readonly AgentToolCall[] = [];
    const test = workflow({
      webSearch: {
        search: async () => {
          openWhenAsked = [...test.openedCalls];
          return { ok: true as const, results: [] };
        },
      },
      turns: [
        {
          kind: "tools",
          calls: [
            { callId: "a", name: "web_search", arguments: { query: "unified memory bandwidth" } },
          ],
        },
        { kind: "output", output: { attach: [], reasoning: "Nothing worth attaching." } },
      ],
    });

    await settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never);

    expect(openWhenAsked).toMatchObject([
      {
        tool: "web_search",
        outcome: "running",
        request: { query: "unified memory bandwidth" },
      },
    ]);
  });

  it("never lets a search result reach the Story as evidence", async () => {
    // Search offers a place to look. Only fetch_url retrieves a page, and only a retrieved page
    // becomes a Source, so a candidate the Researcher tries to attach without reading is refused
    // by the same rule that refuses a URL it invented.
    const test = workflow({
      webSearch: {
        search: async () => ({
          ok: true as const,
          results: [
            {
              title: "A promising page",
              url: "https://example.test/unread",
              snippet: "It says the memory bandwidth is higher.",
              engine: "duckduckgo",
            },
          ],
        }),
      },
      turns: [
        {
          kind: "tools",
          calls: [{ callId: "a", name: "web_search", arguments: { query: "memory bandwidth" } }],
        },
        {
          kind: "output",
          output: {
            attach: [{ url: "https://example.test/unread", relevance: "The search found it." }],
            reasoning: "The snippet says so.",
          },
        },
      ],
    });

    await settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never);

    expect(test.attach).not.toHaveBeenCalled();
  });

  it("runs without an archive rather than offering a tool it cannot answer", async () => {
    const test = workflow({
      turns: [{ kind: "output", output: { attach: [], reasoning: "Nothing to add." } }],
    });

    await settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never);

    expect(test.offered[0]).toEqual(["fetch_url"]);
  });

  it("widens evidence before a Story is assigned, not after", async () => {
    const test = workflow({ turns: [], state: "assigned" });

    await expect(test.run({ storyId: STORY, requestedBy: OPERATOR })).resolves.toMatchObject({
      ok: false,
      error: { code: "SOURCE_RESEARCH_NOT_ALLOWED" },
    });
  });

  it("reads how far it may go from the newsroom rather than from a constant", async () => {
    // A search and a fetch cost a call each, so what a comparison piece costs depends on what a
    // newsroom pays. One call buys one retrieval, and the second attempt is refused.
    const test = workflow({
      budget: { maximumCalls: 1, maximumTurns: 6 },
      turns: [fetched, fetched, { kind: "output", output: { attach: [], reasoning: "Done." } }],
    });

    await settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never);

    expect(test.openedCalls).toHaveLength(2);
    expect(test.settledCalls[1]).toMatchObject({
      outcome: "failed",
      failure: { code: "TOOL_BUDGET_EXHAUSTED" },
    });
  });

  it("stops on turns while it still has calls left to spend", async () => {
    // Calls are money and turns are latency. A newsroom that will pay for twenty retrievals but
    // will not wait through twenty round trips has to be able to say so.
    const test = workflow({
      budget: { maximumCalls: 20, maximumTurns: 2 },
      turns: [fetched, fetched, fetched, fetched],
    });

    await settleAgentRun(test.run({ storyId: STORY, requestedBy: OPERATOR }) as never);

    expect(test.turnCount()).toBe(2);
    expect(test.openedCalls.length).toBeLessThan(20);
  });
});
