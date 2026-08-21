import { randomUUID } from "node:crypto";
import { Pool, type PoolConfig } from "pg";
import { createPostgresAgentRunRepository } from "@/adapters/agent-run-persistence";
import {
  createPostgresWriterDraftPersistence,
  createPostgresWriterRevisionPersistence,
} from "@/adapters/article-persistence";
import { createOpenRouterStructuredModel } from "@/adapters/model";
import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import {
  createWriterDraft,
  type StartCreateWriterDraftResult,
  type WriterModelResolution,
} from "@/application/writer-drafts";
import {
  createWriterRevision,
  type StartCreateWriterRevisionResult,
} from "@/application/writer-revisions";
import {
  agentRunId,
  articleId,
  articleRevisionId,
  transitionId,
  type EditorialActor,
  type ModelDescriptor,
  type StoryId,
} from "@/domain/editorial";
import {
  loadWriterRuntimeConfiguration,
  type WriterRuntimeConfiguration,
} from "./writer-configuration";

export interface WriterRuntime {
  readonly createWriterDraft: (command: {
    readonly storyId: StoryId;
    readonly requestedBy: EditorialActor;
  }) => Promise<StartCreateWriterDraftResult>;
  readonly createWriterRevision: (command: {
    readonly storyId: StoryId;
    readonly requestedBy: EditorialActor;
  }) => Promise<StartCreateWriterRevisionResult>;
  close(): Promise<void>;
}

export function resolveWriterModel(
  descriptor: ModelDescriptor | null,
  defaultModel: string | null,
  createModel: (model: string) => import("@/application/model").StructuredModel,
): WriterModelResolution {
  if (descriptor && descriptor.provider !== "openrouter")
    return {
      ok: false,
      error: {
        code: "WRITER_MODEL_UNSUPPORTED",
        message: "The assigned Writer model provider is not executable.",
      },
    };
  const model = descriptor?.model ?? defaultModel;
  return model
    ? { ok: true, model: createModel(model) }
    : {
        ok: false,
        error: {
          code: "WRITER_MODEL_UNAVAILABLE",
          message: "Writer execution has no configured model.",
        },
      };
}

export function createWriterRuntime(options: {
  readonly configuration: WriterRuntimeConfiguration;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}): WriterRuntime {
  const pool = (options.createPool ?? ((configuration) => new Pool(configuration)))({
    connectionString: options.configuration.databaseUrl,
  });
  const uuid = options.createUuid ?? randomUUID;
  const workflow = createWriterDraft({
    inspections: createPostgresStoryInspectionRepository({ pool }),
    runs: createPostgresAgentRunRepository({ pool }),
    persistence: createPostgresWriterDraftPersistence({ pool }),
    resolveModel: (descriptor) =>
      resolveWriterModel(descriptor, options.configuration.defaultModel, (model) =>
        createOpenRouterStructuredModel({ apiKey: options.configuration.openRouterApiKey, model }),
      ),
    createAgentRunId: () => agentRunId(uuid()),
    createArticleId: () => articleId(uuid()),
    createRevisionId: () => articleRevisionId(uuid()),
    createTransitionId: () => transitionId(uuid()),
    now: options.now ?? (() => new Date().toISOString()),
  });
  const revisionWorkflow = createWriterRevision({
    inspections: createPostgresStoryInspectionRepository({ pool }),
    runs: createPostgresAgentRunRepository({ pool }),
    persistence: createPostgresWriterRevisionPersistence({ pool }),
    resolveModel: (descriptor) =>
      resolveWriterModel(descriptor, options.configuration.defaultModel, (model) =>
        createOpenRouterStructuredModel({ apiKey: options.configuration.openRouterApiKey, model }),
      ),
    createAgentRunId: () => agentRunId(uuid()),
    createRevisionId: () => articleRevisionId(uuid()),
    createTransitionId: () => transitionId(uuid()),
    now: options.now ?? (() => new Date().toISOString()),
  });
  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    createWriterDraft: workflow,
    createWriterRevision: revisionWorkflow,
    close() {
      closePromise ??= Promise.resolve().then(() => pool.end());
      return closePromise;
    },
  });
}

export function createWriterRuntimeFromEnvironment(
  options: {
    readonly environment?: Readonly<Partial<NodeJS.ProcessEnv>>;
    readonly now?: () => string;
    readonly createUuid?: () => string;
    readonly createPool?: (configuration: PoolConfig) => Pool;
  } = {},
): WriterRuntime {
  return createWriterRuntime({
    configuration: loadWriterRuntimeConfiguration(options.environment),
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
