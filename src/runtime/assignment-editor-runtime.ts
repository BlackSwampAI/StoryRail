import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import { createPostgresNewsroomStandardsRepository } from "@/adapters/newsroom-standards-persistence";

import { createPostgresAgentProfileRepository } from "@/adapters/agent-profile-persistence";
import { createPostgresAgentRunRepository } from "@/adapters/agent-run-persistence";
import { createOpenRouterStructuredModel } from "@/adapters/model";
import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import {
  createGenerateAssignmentProposal,
  type StartAssignmentProposalResult,
  type GenerateAssignmentProposalCommand,
} from "@/application/assignment-proposals";
import { OPENROUTER_API_KEY_SLOT, agentRunId, type SiteId } from "@/domain/editorial";

import { resolveSiteId } from "./site-configuration";
import { createSiteStore } from "./site-store";
import {
  loadAssignmentEditorRuntimeConfiguration,
  type AssignmentEditorRuntimeConfiguration,
} from "./assignment-editor-configuration";

export interface AssignmentEditorRuntime {
  readonly generateAssignmentProposal: (
    command: GenerateAssignmentProposalCommand,
  ) => Promise<StartAssignmentProposalResult>;
  close(): Promise<void>;
}

export interface CreateAssignmentEditorRuntimeOptions {
  readonly siteId: SiteId;
  readonly configuration: AssignmentEditorRuntimeConfiguration;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}

export function createAssignmentEditorRuntime(
  options: CreateAssignmentEditorRuntimeOptions,
): AssignmentEditorRuntime {
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
  const createUuid = options.createUuid ?? randomUUID;
  const store = createSiteStore({
    pool,
    siteId: options.siteId,
    credentialKey: options.configuration.credentialKey,
  });
  const generateAssignmentProposal = createGenerateAssignmentProposal({
    readNewsroomStandards,
    inspections: createPostgresStoryInspectionRepository({ pool, siteId: options.siteId }),
    profiles: createPostgresAgentProfileRepository({ pool, siteId: options.siteId }),
    runs: createPostgresAgentRunRepository({ pool }),
    // The model this newsroom proposes assignments with, read when a proposal starts so a change
    // in the settings screen reaches the next proposal rather than the next restart. The key is
    // resolved here, before a run is recorded, so a newsroom with none is told about the key
    // rather than shown a proposal that failed.
    resolveModel: async () => {
      const key = await store.resolveApiKey(OPENROUTER_API_KEY_SLOT);
      if (!key.ok) return { ok: false as const, error: key.error };
      return {
        ok: true as const,
        model: createOpenRouterStructuredModel({
          resolveApiKey: async () => key.apiKey,
          model: (await store.readModelIds()).assignmentEditor,
        }),
      };
    },
    createAgentRunId: () => agentRunId(createUuid()),
    now: options.now ?? (() => new Date().toISOString()),
  });
  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    generateAssignmentProposal,
    close() {
      closePromise ??= Promise.resolve().then(() => pool.end());
      return closePromise;
    },
  });
}

export function createAssignmentEditorRuntimeFromEnvironment(
  options: {
    readonly environment?: NodeJS.ProcessEnv;
    readonly now?: () => string;
    readonly createUuid?: () => string;
    readonly createPool?: (configuration: PoolConfig) => Pool;
  } = {},
): AssignmentEditorRuntime {
  return createAssignmentEditorRuntime({
    configuration: loadAssignmentEditorRuntimeConfiguration(options.environment),
    siteId: resolveSiteId(options.environment ?? process.env),
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
