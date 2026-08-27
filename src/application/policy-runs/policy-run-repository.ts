import type {
  PolicyRun,
  PolicyRunConclusion,
  PolicyRunId,
  PolicyRunStep,
  StoryId,
} from "@/domain/editorial";

export type AppendPolicyRunResult =
  | { readonly ok: true; readonly run: PolicyRun }
  | {
      readonly ok: false;
      readonly error: {
        readonly code:
          "POLICY_RUN_ID_CONFLICT" | "POLICY_ALREADY_RUNNING" | "POLICY_RUN_ROOT_UNAVAILABLE";
        readonly message: string;
      };
    };

export type UpdatePolicyRunResult =
  | { readonly ok: true; readonly run: PolicyRun }
  | {
      readonly ok: false;
      readonly error: { readonly code: "POLICY_RUN_NOT_RUNNING"; readonly message: string };
    };

export interface PolicyRunRepository {
  append(run: PolicyRun): Promise<AppendPolicyRunResult>;
  /** Moves the pointer forward. Silence past a threshold is what abandonment is detected by. */
  observe(command: {
    readonly id: PolicyRunId;
    readonly step: PolicyRunStep;
    readonly observedAt: string;
    /**
     * The Story the policy has reached, for a run that began at a URL and did not have one.
     * Passed once, at the step that creates it; a run may learn its Story but never change it.
     */
    readonly storyId?: StoryId;
  }): Promise<UpdatePolicyRunResult>;
  settle(command: {
    readonly id: PolicyRunId;
    readonly conclusion: PolicyRunConclusion;
    readonly reason: string;
    readonly completedAt: string;
  }): Promise<UpdatePolicyRunResult>;
  findById(id: PolicyRunId): Promise<PolicyRun | null>;
  findByStoryId(storyId: StoryId): Promise<readonly PolicyRun[]>;
  /** Policy runs that have reported nothing since the given moment. */
  listStaleRunning(before: string): Promise<readonly PolicyRun[]>;
}
