import { randomUUID } from "node:crypto";
import { ChatOpenRouter } from "@langchain/openrouter";
import { Pool, type PoolConfig } from "pg";

import { createPostgresAgentProfileRepository } from "@/adapters/agent-profile-persistence";
import { createPostgresAgentRunRepository } from "@/adapters/agent-run-persistence";
import { createPostgresAgentToolCallRepository } from "@/adapters/agent-tool-call-persistence";
import { createOpenRouterStructuredModel, withOpenRouterTools } from "@/adapters/model";
import { createFirecrawlSourceExtractor } from "@/adapters/source-extraction";
import { createPostgresResearchPersistence } from "@/adapters/source-research-persistence";
import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import {
  createResearchStorySources,
  type ResearcherModelResolution,
  type StartSourceResearchResult,
} from "@/application/source-research";
import {
  agentRunId,
  agentToolCallId,
  sourceExtractionId,
  sourceId,
  type EditorialActor,
  type ModelDescriptor,
  type StoryId,
} from "@/domain/editorial";

import {
  loadResearcherRuntimeConfiguration,
  type ResearcherRuntimeConfiguration,
} from "./researcher-configuration";

export interface ResearcherRuntime {
  readonly researchStorySources: (command: {
    readonly storyId: StoryId;
    readonly requestedBy: EditorialActor;
  }) => Promise<StartSourceResearchResult>;
  close(): Promise<void>;
}

export function createResearcherRuntime(options: {
  readonly configuration: ResearcherRuntimeConfiguration;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}): ResearcherRuntime {
  const pool = (options.createPool ?? ((configuration) => new Pool(configuration)))({
    connectionString: options.configuration.databaseUrl,
  });
  const uuid = options.createUuid ?? randomUUID;
  const resolveModel = (descriptor: ModelDescriptor | null): ResearcherModelResolution => {
    const slug = descriptor?.model ?? options.configuration.defaultModel;
    if (!slug || (descriptor && descriptor.provider !== "openrouter"))
      return {
        ok: false,
        error: {
          code: "RESEARCHER_MODEL_UNAVAILABLE",
          message: "Research has no configured model that can use tools.",
        },
      };
    // A run that needs tools must fail on a model that cannot use them rather than quietly
    // answering without them, so tool support is composed in explicitly here.
    return {
      ok: true,
      model: withOpenRouterTools(
        createOpenRouterStructuredModel({
          apiKey: options.configuration.openRouterApiKey,
          model: slug,
        }),
        {
          chatModel: new ChatOpenRouter({
            apiKey: options.configuration.openRouterApiKey,
            model: slug,
            maxRetries: 0,
          }) as never,
          mapFailure: () => ({
            ok: false,
            failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
          }),
        },
      ),
    };
  };

  const workflow = createResearchStorySources({
    inspections: createPostgresStoryInspectionRepository({ pool }),
    profiles: createPostgresAgentProfileRepository({ pool }),
    runs: createPostgresAgentRunRepository({ pool }),
    toolCalls: createPostgresAgentToolCallRepository({ pool }),
    persistence: createPostgresResearchPersistence({ pool }),
    extractor: createFirecrawlSourceExtractor({ apiKey: options.configuration.firecrawlApiKey }),
    resolveModel,
    createAgentRunId: () => agentRunId(uuid()),
    createToolCallId: () => agentToolCallId(uuid()),
    createSourceId: () => sourceId(uuid()),
    createExtractionId: () => sourceExtractionId(uuid()),
    now: options.now ?? (() => new Date().toISOString()),
  });

  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    researchStorySources: workflow,
    close() {
      closePromise ??= Promise.resolve().then(() => pool.end());
      return closePromise;
    },
  });
}

export function createResearcherRuntimeFromEnvironment(
  options: {
    readonly environment?: Readonly<Partial<NodeJS.ProcessEnv>>;
    readonly now?: () => string;
    readonly createUuid?: () => string;
    readonly createPool?: (configuration: PoolConfig) => Pool;
  } = {},
): ResearcherRuntime {
  return createResearcherRuntime({
    configuration: loadResearcherRuntimeConfiguration(options.environment),
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
