import { randomUUID } from "node:crypto";
import { Pool, type PoolConfig } from "pg";

import { createPostgresNewsroomStandardsRepository } from "@/adapters/newsroom-standards-persistence";
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
  OPENROUTER_API_KEY_SLOT,
  agentRunId,
  articleId,
  articleRevisionId,
  transitionId,
  type EditorialActor,
  type ModelDescriptor,
  type SiteId,
  type StoryId,
} from "@/domain/editorial";
import { resolveSiteId } from "./site-configuration";
import { createSiteStore } from "./site-store";
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
  readonly siteId: SiteId;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}): WriterRuntime {
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
  const uuid = options.createUuid ?? randomUUID;
  const store = createSiteStore({
    pool,
    siteId: options.siteId,
    credentialKey: options.configuration.credentialKey,
  });
  // Both the model identifier and the key behind it are read per run. A Writer switched to a
  // different model, or a key replaced after it expired, reaches the next draft rather than the
  // next restart.
  //
  // The credential is resolved here rather than inside the model, because this is the last point
  // at which a missing one can be reported as itself. A run is recorded immediately after this
  // returns, and a run recorded for work that was never attempted is a fabricated fact.
  const resolveModel = async (descriptor: ModelDescriptor | null) => {
    const key = await store.resolveApiKey(OPENROUTER_API_KEY_SLOT);
    if (!key.ok) return { ok: false as const, error: key.error };
    return resolveWriterModel(descriptor, (await store.readModelIds()).writer, (model) =>
      createOpenRouterStructuredModel({ resolveApiKey: async () => key.apiKey, model }),
    );
  };
  const workflow = createWriterDraft({
    readNewsroomStandards,
    inspections: createPostgresStoryInspectionRepository({ pool, siteId: options.siteId }),
    runs: createPostgresAgentRunRepository({ pool }),
    persistence: createPostgresWriterDraftPersistence({ pool }),
    resolveModel,
    createAgentRunId: () => agentRunId(uuid()),
    createArticleId: () => articleId(uuid()),
    createRevisionId: () => articleRevisionId(uuid()),
    createTransitionId: () => transitionId(uuid()),
    now: options.now ?? (() => new Date().toISOString()),
  });
  const revisionWorkflow = createWriterRevision({
    readNewsroomStandards,
    inspections: createPostgresStoryInspectionRepository({ pool, siteId: options.siteId }),
    runs: createPostgresAgentRunRepository({ pool }),
    persistence: createPostgresWriterRevisionPersistence({ pool }),
    resolveModel,
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
    siteId: resolveSiteId(options.environment ?? process.env),
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
