import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import { createPostgresAgentProfileRepository } from "@/adapters/agent-profile-persistence";
import { createPostgresAgentRunRepository } from "@/adapters/agent-run-persistence";
import { createOpenRouterStructuredModel } from "@/adapters/model";
import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import {
  createGenerateAssignmentProposal,
  type GenerateAssignmentProposalResult,
  type GenerateAssignmentProposalCommand,
} from "@/application/assignment-proposals";
import { agentRunId } from "@/domain/editorial";

import {
  loadAssignmentEditorRuntimeConfiguration,
  type AssignmentEditorRuntimeConfiguration,
} from "./assignment-editor-configuration";

export interface AssignmentEditorRuntime {
  readonly generateAssignmentProposal: (
    command: GenerateAssignmentProposalCommand,
  ) => Promise<GenerateAssignmentProposalResult>;
  close(): Promise<void>;
}

export interface CreateAssignmentEditorRuntimeOptions {
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
  const createUuid = options.createUuid ?? randomUUID;
  const generateAssignmentProposal = createGenerateAssignmentProposal({
    inspections: createPostgresStoryInspectionRepository({ pool }),
    profiles: createPostgresAgentProfileRepository({ pool }),
    runs: createPostgresAgentRunRepository({ pool }),
    model: createOpenRouterStructuredModel({
      apiKey: options.configuration.openRouterApiKey,
      model: options.configuration.model,
    }),
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
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
