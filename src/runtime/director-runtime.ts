import { randomUUID } from "node:crypto";
import { Pool, type PoolConfig } from "pg";

import { createPostgresAgentProfileRepository } from "@/adapters/agent-profile-persistence";
import { createPostgresAgentRunRepository } from "@/adapters/agent-run-persistence";
import { createOpenRouterStructuredModel } from "@/adapters/model";
import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import {
  createRunDirectorReview,
  type DirectorModelResolution,
  type RunDirectorReviewResult,
} from "@/application/director-reviews";
import {
  agentRunId,
  type EditorialActor,
  type ModelDescriptor,
  type StoryId,
} from "@/domain/editorial";
import {
  loadDirectorRuntimeConfiguration,
  type DirectorRuntimeConfiguration,
} from "./director-configuration";

export interface DirectorRuntime {
  readonly runDirectorReview: (command: {
    readonly storyId: StoryId;
    readonly requestedBy: EditorialActor;
  }) => Promise<RunDirectorReviewResult>;
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
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}): DirectorRuntime {
  const pool = (options.createPool ?? ((configuration) => new Pool(configuration)))({
    connectionString: options.configuration.databaseUrl,
  });
  const uuid = options.createUuid ?? randomUUID;
  const workflow = createRunDirectorReview({
    inspections: createPostgresStoryInspectionRepository({ pool }),
    profiles: createPostgresAgentProfileRepository({ pool }),
    runs: createPostgresAgentRunRepository({ pool }),
    resolveModel: (descriptor) =>
      resolveDirectorModel(descriptor, options.configuration.defaultModel, (model) =>
        createOpenRouterStructuredModel({ apiKey: options.configuration.openRouterApiKey, model }),
      ),
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

export function createDirectorRuntimeFromEnvironment(
  options: {
    readonly environment?: Readonly<Partial<NodeJS.ProcessEnv>>;
    readonly now?: () => string;
    readonly createUuid?: () => string;
    readonly createPool?: (configuration: PoolConfig) => Pool;
  } = {},
): DirectorRuntime {
  return createDirectorRuntime({
    configuration: loadDirectorRuntimeConfiguration(options.environment),
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
