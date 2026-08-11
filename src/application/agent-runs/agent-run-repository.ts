import type { AgentRun, AgentRunId, StoryId } from "@/domain/editorial";

export type AppendAgentRunResult =
  | { readonly ok: true; readonly run: AgentRun }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "AGENT_RUN_ID_CONFLICT";
        readonly message: string;
        readonly runId: AgentRunId;
      };
    };

export interface AgentRunRepository {
  append(run: AgentRun): Promise<AppendAgentRunResult>;
  listByStoryId(storyId: StoryId): Promise<readonly AgentRun[]>;
}
