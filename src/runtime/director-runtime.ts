import { randomUUID } from "node:crypto";
import { Pool, type PoolConfig } from "pg";

import { createPostgresNewsroomStandardsRepository } from "@/adapters/newsroom-standards-persistence";

import { createPostgresAgentProfileRepository } from "@/adapters/agent-profile-persistence";
import { createPostgresAgentRunRepository } from "@/adapters/agent-run-persistence";
import { createOpenRouterStructuredModel } from "@/adapters/model";
import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import {
  createRunDirectorReview,
  type DirectorModelResolution,
  type StartRunDirectorReviewResult,
} from "@/application/director-reviews";
import {
  OPENROUTER_API_KEY_SLOT,
  agentRunId,
  type EditorialActor,
  type ModelDescriptor,
  type SiteId,
  type StoryId,
} from "@/domain/editorial";
import { createNewsroomIdentityReader } from "./newsroom-identity";
import { createSiteStore } from "./site-store";
import {
  loadDirectorRuntimeConfiguration,
  type DirectorRuntimeConfiguration,
} from "./director-configuration";

export interface DirectorRuntime {
  readonly runDirectorReview: (command: {
    readonly storyId: StoryId;
    readonly requestedBy: EditorialActor;
  }) => Promise<StartRunDirectorReviewResult>;
  close(): Promise<void>;
}

export function resolveDirectorModel(
  descriptor: ModelDescriptor | null,
  defaultModel: string | null,
  createModel: (model: string) => import("@/application/model").StructuredModel,
): DirectorModelResolution {
  if (descriptor && descriptor.provider !== "openrouter")
    return {
      ok: false,
      error: {
        code: "DIRECTOR_MODEL_UNSUPPORTED",
        message: "The Director model provider is not executable.",
      },
    };
  const model = descriptor?.model ?? defaultModel;
  return model
    ? { ok: true, model: createModel(model) }
    : {
        ok: false,
        error: {
          code: "DIRECTOR_MODEL_UNAVAILABLE",
          message: "Director execution has no configured model.",
        },
      };
}

export function createDirectorRuntime(options: {
  readonly configuration: DirectorRuntimeConfiguration;
  readonly siteId: SiteId;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}): DirectorRuntime {
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
  const workflow = createRunDirectorReview({
    readNewsroomStandards,
    readNewsroomIdentity,
    inspections: createPostgresStoryInspectionRepository({ pool, siteId: options.siteId }),
    profiles: createPostgresAgentProfileRepository({ pool, siteId: options.siteId }),
    runs: createPostgresAgentRunRepository({ pool }),
    // The model and the key behind it are read when a review starts, so a change to either
    // reaches the next review rather than the next restart. The credential is resolved before
    // the run is recorded, so a newsroom with no key is told that rather than shown a review
    // that failed.
    resolveModel: async (descriptor) => {
      const key = await store.resolveApiKey(OPENROUTER_API_KEY_SLOT);
      if (!key.ok) return { ok: false as const, error: key.error };
      return resolveDirectorModel(descriptor, (await store.readModelIds()).director, (model) =>
        createOpenRouterStructuredModel({ resolveApiKey: async () => key.apiKey, model }),
      );
    },
    createAgentRunId: () => agentRunId(uuid()),
    now: options.now ?? (() => new Date().toISOString()),
  });
  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    runDirectorReview: workflow,
    close() {
      closePromise ??= Promise.resolve().then(() => pool.end());
      return closePromise;
    },
  });
}

export function createDirectorRuntimeFromEnvironment(options: {
  readonly siteId: SiteId;
  readonly environment?: Readonly<Partial<NodeJS.ProcessEnv>>;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}): DirectorRuntime {
  return createDirectorRuntime({
    configuration: loadDirectorRuntimeConfiguration(options.environment),
    siteId: options.siteId,
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
