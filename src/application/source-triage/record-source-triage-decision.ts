import {
  decideSourceTriage,
  type EditorialActor,
  type SourceId,
  type SourceTriageDecisionKind,
  type StoryId,
  type SourceTriageReasonRequiredError,
  type SourceTriageStoryForbiddenError,
  type SourceTriageStoryRequiredError,
} from "@/domain/editorial";

import type {
  RecordSourceTriageDecisionResult,
  SourceTriageDecisionRepository,
} from "./source-triage-repository";

export interface RecordSourceTriageDecisionCommand {
  readonly sourceId: SourceId;
  readonly decision: SourceTriageDecisionKind;
  readonly storyId: StoryId | null;
  readonly reason: string;
  readonly decidedBy: EditorialActor;
}

export type RecordSourceTriageDecisionWorkflowResult =
  | RecordSourceTriageDecisionResult
  | {
      readonly ok: false;
      readonly error:
        | SourceTriageReasonRequiredError
        | SourceTriageStoryRequiredError
        | SourceTriageStoryForbiddenError;
    };

export type RecordSourceTriageDecisionWorkflow = (
  command: RecordSourceTriageDecisionCommand,
) => Promise<RecordSourceTriageDecisionWorkflowResult>;

export function createRecordSourceTriageDecision(dependencies: {
  readonly repository: SourceTriageDecisionRepository;
  readonly now: () => string;
}): RecordSourceTriageDecisionWorkflow {
  return async (command) => {
    const result = decideSourceTriage({ ...command, decidedAt: dependencies.now() });
    return result.ok ? dependencies.repository.record(result.triageDecision) : result;
  };
}
