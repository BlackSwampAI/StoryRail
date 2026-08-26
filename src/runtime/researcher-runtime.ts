import { randomUUID } from "node:crypto";
import { ChatOpenRouter } from "@langchain/openrouter";
import { Pool, type PoolConfig } from "pg";

import { createPostgresNewsroomStandardsRepository } from "@/adapters/newsroom-standards-persistence";

import { createPostgresAgentProfileRepository } from "@/adapters/agent-profile-persistence";
import { createPostgresAgentRunRepository } from "@/adapters/agent-run-persistence";
import { createPostgresAgentToolCallRepository } from "@/adapters/agent-tool-call-persistence";
import { createPostgresArchiveRepository } from "@/adapters/archive";
import { createOpenRouterStructuredModel, withOpenRouterTools } from "@/adapters/model";
import { createFirecrawlSourceExtractor } from "@/adapters/source-extraction";
import { createPostgresResearchPersistence } from "@/adapters/source-research-persistence";
import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import { createPostgresSiteSettingsRepository } from "@/adapters/site-settings-persistence";
import { createSiteWebSearchDirectory } from "@/adapters/web-search";
import {
  createResearchStorySources,
  type ResearcherModelResolution,
  type StartSourceResearchResult,
} from "@/application/source-research";
import {
  FIRECRAWL_API_KEY_SLOT,
  OPENROUTER_API_KEY_SLOT,
  agentRunId,
  agentToolCallId,
  sourceExtractionId,
  sourceId,
  type EditorialActor,
  type ModelDescriptor,
  type SiteId,
  type StoryId,
} from "@/domain/editorial";

import { createNewsroomIdentityReader } from "./newsroom-identity";
import { createSiteStore } from "./site-store";
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
  readonly siteId: SiteId;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}): ResearcherRuntime {
  const pool = (options.createPool ?? ((configuration) => new Pool(configuration)))({
    connectionString: options.configuration.databaseUrl,
  });
  // The standards in force when a run starts. Read per run rather than cached, so an edit
  // reaches the next piece of work rather than the next restart.
  const readNewsroomStandards = async (): Promise<string | null> => {
    const history = await createPostgresNewsroomStandardsRepository({
      pool,
      siteId: options.siteId,
    }).list();
    return history.at(-1)?.text ?? null;
  };
  const readNewsroomIdentity = createNewsroomIdentityReader({ pool, siteId: options.siteId });
  const uuid = options.createUuid ?? randomUUID;
  const store = createSiteStore({
    pool,
    siteId: options.siteId,
    credentialKey: options.configuration.credentialKey,
  });
  const resolveModel = async (
    descriptor: ModelDescriptor | null,
  ): Promise<ResearcherModelResolution> => {
    // Resolved before the run is recorded, so a newsroom with no key is told about the key.
    const key = await store.resolveApiKey(OPENROUTER_API_KEY_SLOT);
    if (!key.ok) return { ok: false, error: key.error };
    const slug = descriptor?.model ?? (await store.readModelIds()).researcher;
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
        createOpenRouterStructuredModel({ resolveApiKey: async () => key.apiKey, model: slug }),
        {
          resolveChatModel: async () =>
            new ChatOpenRouter({ apiKey: key.apiKey, model: slug, maxRetries: 0 }) as never,
          mapFailure: () => ({
            ok: false,
            failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
          }),
        },
      ),
    };
  };

  const workflow = createResearchStorySources({
    readNewsroomStandards,
    readNewsroomIdentity,
    inspections: createPostgresStoryInspectionRepository({ pool, siteId: options.siteId }),
    profiles: createPostgresAgentProfileRepository({ pool, siteId: options.siteId }),
    runs: createPostgresAgentRunRepository({ pool }),
    toolCalls: createPostgresAgentToolCallRepository({ pool }),
    persistence: createPostgresResearchPersistence({ pool, siteId: options.siteId }),
    extractor: createFirecrawlSourceExtractor({
      resolveApiKey: () => store.resolveApiKey(FIRECRAWL_API_KEY_SLOT),
    }),
    archive: createPostgresArchiveRepository({ pool, siteId: options.siteId }),
    resolveWebSearch: createSiteWebSearchDirectory({
      settings: createPostgresSiteSettingsRepository({ pool, siteId: options.siteId }),
      resolveApiKey: (slot) => store.resolveApiKey(slot),
    }),
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

export function createResearcherRuntimeFromEnvironment(options: {
  readonly siteId: SiteId;
  readonly environment?: Readonly<Partial<NodeJS.ProcessEnv>>;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}): ResearcherRuntime {
  return createResearcherRuntime({
    configuration: loadResearcherRuntimeConfiguration(options.environment),
    siteId: options.siteId,
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
