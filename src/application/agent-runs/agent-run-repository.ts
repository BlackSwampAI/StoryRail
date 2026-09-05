import type { AgentRun, AgentRunId, StoryId } from "@/domain/editorial";

export type AppendAgentRunResult =
  | { readonly ok: true; readonly run: AgentRun }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "AGENT_RUN_ID_CONFLICT" | "DIRECTOR_REVIEW_ALREADY_SUCCEEDED";
        readonly message: string;
        readonly runId: AgentRunId;
      };
    };

export type CompleteAgentRunResult =
  | { readonly ok: true; readonly run: AgentRun }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "AGENT_RUN_NOT_RUNNING" | "DIRECTOR_REVIEW_ALREADY_SUCCEEDED";
        readonly message: string;
        readonly runId: AgentRunId;
      };
    };

export interface AgentRunRepository {
  append(run: AgentRun): Promise<AppendAgentRunResult>;
  /**
   * Records the outcome of a run that was appended while still in flight. This is the only
   * mutation an AgentRun permits, and it is one-way: a completed run never changes again.
   */
  complete(run: AgentRun): Promise<CompleteAgentRunResult>;
  listByStoryId(storyId: StoryId): Promise<readonly AgentRun[]>;
}

/** Narrow recovery view; ordinary editorial workflows never need to scan unrelated runs. */
export interface StaleAgentRunRepository {
  /** Running work durably recorded before this instant, oldest first. */
  listStaleRunning(before: string): Promise<readonly AgentRun[]>;
}
