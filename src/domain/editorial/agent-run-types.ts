import type { GroundingFinding } from "./article-grounding";
import type { AssignmentProposal } from "./assignment-proposal-types";
import type { DirectorReviewRecommendation } from "./director-review-types";
import type { ReviewDecision } from "./review-decision-types";
import type { ModelDescriptor, ModelFailureCode } from "./source-evidence-preparation-types";
import type {
  AgentProfileId,
  AgentRunId,
  ArticleId,
  ArticleRevisionId,
  AssignmentId,
  EditorialActor,
  SourceEvidencePreparationId,
  SourceExtractionId,
  SourceId,
  StoryId,
  StoryState,
} from "./types";

export interface EvidenceReference {
  readonly sourceId: SourceId;
  readonly relevance: string;
  readonly evidenceKind: "prepared" | "raw";
  readonly evidenceId: SourceEvidencePreparationId | SourceExtractionId;
}

/**
 * Why a supervised run failed. A grounding failure also records which citations could not be
 * supported: a run that says only that it was refused leaves the operator with the same opacity
 * the citations were introduced to remove.
 */
export interface AgentRunFailure {
  readonly code: ModelFailureCode;
  readonly retryable: boolean;
  readonly findings?: readonly GroundingFinding[];
}

export interface AssignmentProposalAgentRunInput {
  readonly story: {
    readonly id: StoryId;
    readonly title: string;
    readonly state: StoryState;
    readonly revisionCycle: number;
  };
  readonly evidence: readonly EvidenceReference[];
  readonly unavailableSourceIds: readonly SourceId[];
  readonly writerProfileIds: readonly AgentProfileId[];
}

interface AssignmentProposalAgentRunCommon {
  readonly id: AgentRunId;
  readonly storyId: StoryId;
  readonly profileId: AgentProfileId;
  readonly role: "assignment_editor";
  readonly operation: "assignment_proposal";
  readonly model: ModelDescriptor;
  readonly prompt: { readonly key: string; readonly version: string };
  readonly requestedBy: EditorialActor;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly input: AssignmentProposalAgentRunInput;
}

export type AssignmentProposalAgentRun = AssignmentProposalAgentRunCommon &
  (
    | { readonly outcome: "running" }
    | { readonly outcome: "succeeded"; readonly proposal: AssignmentProposal }
    | {
        readonly outcome: "failed";
        readonly failure: AgentRunFailure;
      }
  );

export interface WriterArticleDraftAgentRunInput {
  readonly story: AssignmentProposalAgentRunInput["story"];
  readonly assignment: {
    readonly id: AssignmentId;
    readonly storyId: StoryId;
    readonly writerProfileId: AgentProfileId;
    readonly sourceIds: readonly SourceId[];
    readonly angle: string;
    readonly brief: string;
    readonly constraints: string | null;
  };
  readonly evidence: readonly EvidenceReference[];
  readonly unavailableSourceIds: readonly SourceId[];
}

interface WriterArticleDraftAgentRunCommon {
  readonly id: AgentRunId;
  readonly storyId: StoryId;
  readonly profileId: AgentProfileId;
  readonly role: "writer";
  readonly operation: "article_draft";
  readonly model: ModelDescriptor;
  readonly prompt: { readonly key: string; readonly version: string };
  readonly requestedBy: EditorialActor;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly input: WriterArticleDraftAgentRunInput;
}

export type WriterArticleDraftAgentRun = WriterArticleDraftAgentRunCommon &
  (
    | { readonly outcome: "running" }
    | {
        readonly outcome: "succeeded";
        readonly articleId: ArticleId;
        readonly revisionId: ArticleRevisionId;
      }
    | {
        readonly outcome: "failed";
        readonly failure: AgentRunFailure;
      }
  );

export interface WriterArticleRevisionAgentRunInput extends WriterArticleDraftAgentRunInput {
  readonly article: {
    readonly id: ArticleId;
    readonly assignmentId: AssignmentId;
  };
  readonly revision: DirectorArticleReviewAgentRunInput["revision"];
  readonly directorReview: DirectorReviewRecommendation;
  readonly reviewDecision: ReviewDecision;
}

interface WriterArticleRevisionAgentRunCommon {
  readonly id: AgentRunId;
  readonly storyId: StoryId;
  readonly profileId: AgentProfileId;
  readonly role: "writer";
  readonly operation: "article_revision";
  readonly model: ModelDescriptor;
  readonly prompt: { readonly key: string; readonly version: string };
  readonly requestedBy: EditorialActor;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly input: WriterArticleRevisionAgentRunInput;
}

export type WriterArticleRevisionAgentRun = WriterArticleRevisionAgentRunCommon &
  (
    | { readonly outcome: "running" }
    | {
        readonly outcome: "succeeded";
        readonly articleId: ArticleId;
        readonly revisionId: ArticleRevisionId;
      }
    | {
        readonly outcome: "failed";
        readonly failure: AgentRunFailure;
      }
  );

export interface DirectorArticleReviewAgentRunInput {
  readonly story: AssignmentProposalAgentRunInput["story"];
  readonly assignment: WriterArticleDraftAgentRunInput["assignment"];
  readonly article: {
    readonly id: ArticleId;
    readonly assignmentId: AssignmentId;
  };
  readonly revision: {
    readonly id: ArticleRevisionId;
    readonly articleId: ArticleId;
    readonly revisionNumber: 1 | 2 | 3;
    readonly writerProfileId: AgentProfileId;
    readonly agentRunId: AgentRunId;
    readonly headline: string;
    readonly dek: string | null;
    readonly bodyMarkdown: string;
  };
  readonly evidence: readonly EvidenceReference[];
  readonly unavailableSourceIds: readonly SourceId[];
}

interface DirectorArticleReviewAgentRunCommon {
  readonly id: AgentRunId;
  readonly storyId: StoryId;
  readonly profileId: AgentProfileId;
  readonly role: "editor_in_chief";
  readonly operation: "article_review";
  readonly model: ModelDescriptor;
  readonly prompt: { readonly key: string; readonly version: string };
  readonly requestedBy: EditorialActor;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly input: DirectorArticleReviewAgentRunInput;
}

export type DirectorArticleReviewAgentRun = DirectorArticleReviewAgentRunCommon &
  (
    | { readonly outcome: "running" }
    | { readonly outcome: "succeeded"; readonly review: DirectorReviewRecommendation }
    | {
        readonly outcome: "failed";
        readonly failure: AgentRunFailure;
      }
  );

export type AgentRun =
  | AssignmentProposalAgentRun
  | WriterArticleDraftAgentRun
  | WriterArticleRevisionAgentRun
  | DirectorArticleReviewAgentRun;

export type AgentRunValidationCode =
  | "AGENT_RUN_IDENTITY_INVALID"
  | "AGENT_RUN_ROLE_OPERATION_INVALID"
  | "AGENT_RUN_MODEL_INVALID"
  | "AGENT_RUN_PROMPT_INVALID"
  | "AGENT_RUN_INPUT_INVALID"
  | "AGENT_RUN_EVIDENCE_DUPLICATE"
  | "AGENT_RUN_OUTCOME_INVALID";

export type RecordAgentRunResult =
  | { readonly ok: true; readonly run: AgentRun }
  | {
      readonly ok: false;
      readonly error: { readonly code: AgentRunValidationCode; readonly message: string };
    };
