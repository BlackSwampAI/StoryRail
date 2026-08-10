declare const identifierBrand: unique symbol;

type Identifier<Name extends string> = string & {
  readonly [identifierBrand]: Name;
};

export type SourceId = Identifier<"SourceId">;
export type SourceExtractionId = Identifier<"SourceExtractionId">;
export type SourceEvidencePreparationId = Identifier<"SourceEvidencePreparationId">;
export type StoryId = Identifier<"StoryId">;
export type ArticleId = Identifier<"ArticleId">;
export type AgentRunId = Identifier<"AgentRunId">;
export type OperatorId = Identifier<"OperatorId">;
export type TransitionId = Identifier<"TransitionId">;

export const sourceId = (value: string): SourceId => value as SourceId;
export const sourceExtractionId = (value: string): SourceExtractionId =>
  value as SourceExtractionId;
export const sourceEvidencePreparationId = (value: string): SourceEvidencePreparationId =>
  value as SourceEvidencePreparationId;
export const storyId = (value: string): StoryId => value as StoryId;
export const articleId = (value: string): ArticleId => value as ArticleId;
export const agentRunId = (value: string): AgentRunId => value as AgentRunId;
export const operatorId = (value: string): OperatorId => value as OperatorId;
export const transitionId = (value: string): TransitionId => value as TransitionId;

export const STORY_STATES = [
  "intake",
  "assigned",
  "in_progress",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "published",
] as const;

export type StoryState = (typeof STORY_STATES)[number];

export interface Story {
  readonly id: StoryId;
  readonly title: string;
  readonly state: StoryState;
  readonly revisionCycle: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const AGENT_ROLES = [
  "assignment_editor",
  "writer",
  "fact_checker",
  "editor_in_chief",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export interface OperatorActor {
  readonly type: "operator";
  readonly operatorId: OperatorId;
}

export interface AgentActor {
  readonly type: "agent";
  readonly role: AgentRole;
  readonly runId: AgentRunId;
}

export type EditorialActor = OperatorActor | AgentActor;

export interface StoryTransitionReceipt {
  readonly transitionId: TransitionId;
  readonly storyId: StoryId;
  readonly previousState: StoryState;
  readonly nextState: StoryState;
  readonly actor: EditorialActor;
  readonly reason: string;
  readonly occurredAt: string;
  readonly revisionCycle: number;
}

export interface StoryTransitionCommand {
  readonly story: Story;
  readonly nextState: StoryState;
  readonly actor: EditorialActor;
  readonly reason: string;
  readonly transitionId: TransitionId;
  readonly occurredAt: string;
}

export interface InvalidTransitionError {
  readonly code: "INVALID_TRANSITION";
  readonly message: string;
  readonly previousState: StoryState;
  readonly nextState: StoryState;
}

export interface RevisionLimitReachedError {
  readonly code: "REVISION_LIMIT_REACHED";
  readonly message: string;
  readonly previousState: "in_review";
  readonly nextState: "changes_requested";
  readonly revisionCycle: number;
  readonly maximumRevisionCycles: number;
}

export interface OperatorRequiredError {
  readonly code: "OPERATOR_REQUIRED";
  readonly message: string;
  readonly previousState: StoryState;
  readonly nextState: "approved" | "rejected" | "published";
  readonly actorType: "agent";
}

export interface ReasonRequiredError {
  readonly code: "REASON_REQUIRED";
  readonly message: string;
  readonly previousState: StoryState;
  readonly nextState: StoryState;
}

export type StoryTransitionError =
  InvalidTransitionError | RevisionLimitReachedError | OperatorRequiredError | ReasonRequiredError;

export interface StoryTransitionSuccess {
  readonly ok: true;
  readonly story: Story;
  readonly receipt: StoryTransitionReceipt;
}

export interface StoryTransitionFailure {
  readonly ok: false;
  readonly error: StoryTransitionError;
}

export type StoryTransitionResult = StoryTransitionSuccess | StoryTransitionFailure;
