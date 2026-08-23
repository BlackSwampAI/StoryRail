import { describe, expect, it, vi } from "vitest";

import { settleAgentRun } from "@/test/settle-agent-run";
import type { SourceExtractor } from "@/adapters/source-extraction";
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
    article: null,
  };
}

function workflow(options: {
  readonly turns: readonly unknown[];
  readonly extract?: SourceExtractor["extract"];
  readonly state?: "intake" | "assigned";
  readonly attachOk?: boolean;
}) {
  const attach = vi.fn(async () => ({ ok: options.attachOk !== false }) as never);
  const completed: AgentRun[] = [];
  let turn = 0;
  let ids = 0;
  const run = createResearchStorySources({
    inspections: {
      inspect: vi.fn(async () => ({ ok: true as const, inspection: inspection(options.state) })),
    },
    profiles: { findById: vi.fn(async () => researcher), list: vi.fn(), append: vi.fn() },
    runs: {
      append: vi.fn(async (value) => ({ ok: true as const, run: value })),
      complete: vi.fn(async (value) => {
        completed.push(value);
        return { ok: true as const, run: value };
      }),
      listByStoryId: vi.fn(),
    },
    toolCalls: {
      append: vi.fn(async (call) => ({ ok: true as const, call })),
      complete: vi.fn(async (call) => ({ ok: true as const, call })),
      listByRunId: vi.fn(),
    },
    persistence: { attach },
    extractor: {
      descriptor: { key: "test", version: "1" },
      extract:
        options.extract ??
        vi.fn(async () => ({
          ok: true as const,
          document: document("RFC 1234 defines the format."),
        })),
    },
    resolveModel: () => ({
      ok: true,
      model: {
        descriptor: { provider: "openrouter", model: "researcher" },
        supportsTools: true,
        generateWithTools: vi.fn(async () => {
          const next = options.turns[turn];
          turn += 1;
          return next === undefined
            ? {
                ok: false as const,
                failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
              }
            : { ok: true as const, output: next };
        }),
      } as unknown as ToolAssistedModel,
    }),
    createAgentRunId: () => agentRunId("run-research"),
    createToolCallId: () => agentToolCallId(`tool-${(ids += 1)}`),
    createSourceId: () => sourceId(`found-${(ids += 1)}`),
    createExtractionId: () => sourceExtractionId(`extraction-${(ids += 1)}`),
    now: () => "now",
  });
  return { run, attach, completed };
}

const fetched = {
  kind: "tools" as const,
  calls: [{ callId: "a", name: "fetch_url", arguments: { url: FOUND } }],
};

describe("sending the Researcher out to widen a Story's evidence", () => {
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

  it("widens evidence before a Story is assigned, not after", async () => {
    const test = workflow({ turns: [], state: "assigned" });

    await expect(test.run({ storyId: STORY, requestedBy: OPERATOR })).resolves.toMatchObject({
      ok: false,
      error: { code: "SOURCE_RESEARCH_NOT_ALLOWED" },
    });
  });
});
