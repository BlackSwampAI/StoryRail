import type { StoryInspectionRepository } from "@/application/story-inspection";
import {
  createReviewDecision,
  transitionStory,
  type AgentRunId,
  type OperatorActor,
  type ReviewDecisionId,
  type ReviewDecisionValue,
  type StoryId,
  type StoryTransitionError,
  type TransitionId,
} from "@/domain/editorial";
import type {
  PersistReviewDecisionResult,
  ReviewDecisionPersistence,
} from "./review-decision-persistence";

export type RecordStoryReviewDecisionResult =
  | Extract<PersistReviewDecisionResult, { readonly ok: true }>
  | {
      readonly ok: false;
      readonly error:
        | StoryTransitionError
        | Extract<PersistReviewDecisionResult, { readonly ok: false }>["error"]
        | {
            readonly code:
              | "STORY_NOT_FOUND"
              | "REVIEW_DECISION_NOT_ALLOWED"
              | "ARTICLE_REQUIRED"
              | "ARTICLE_REVISION_REQUIRED"
              | "DIRECTOR_REVIEW_REQUIRED"
              | "DIRECTOR_REVIEW_MISMATCH"
              | "REVIEW_DECISION_REASON_REQUIRED";
            readonly message: string;
            readonly storyId: StoryId;
          };
    };

export function createRecordStoryReviewDecision(dependencies: {
  readonly inspections: StoryInspectionRepository;
  readonly persistence: ReviewDecisionPersistence;
  readonly createDecisionId: () => ReviewDecisionId;
  readonly createTransitionId: () => TransitionId;
  readonly now: () => string;
}) {
  return async (command: {
    readonly storyId: StoryId;
    readonly directorRunId: AgentRunId;
    readonly decision: ReviewDecisionValue;
    readonly reason: string;
    readonly decidedBy: OperatorActor;
  }): Promise<RecordStoryReviewDecisionResult> => {
    const inspected = await dependencies.inspections.inspect(command.storyId);
    if (!inspected.ok)
      return {
        ok: false,
        error: {
          code: "STORY_NOT_FOUND",
          message: "The Story does not exist.",
          storyId: command.storyId,
        },
      };
    const { story, article, agentRuns, reviewDecisions } = inspected.inspection;
    if (story.state !== "in_review")
      return {
        ok: false,
        error: {
          code: "REVIEW_DECISION_NOT_ALLOWED",
          message: "Only an In Review Story can receive a review decision.",
          storyId: story.id,
        },
      };
    if (!article)
      return {
        ok: false,
        error: {
          code: "ARTICLE_REQUIRED",
          message: "A durable Article is required.",
          storyId: story.id,
        },
      };
    const revision = article.revisions.at(-1);
    if (!revision)
      return {
        ok: false,
        error: {
          code: "ARTICLE_REVISION_REQUIRED",
          message: "A current Article Revision is required.",
          storyId: story.id,
        },
      };
    if (reviewDecisions.some((decision) => decision.revisionId === revision.id))
      return {
        ok: false,
        error: {
          code: "REVIEW_DECISION_ALREADY_EXISTS",
          message: "The current Article Revision already has an operator decision.",
          storyId: story.id,
        },
      };
    const run = agentRuns.find(({ id }) => id === command.directorRunId);
    if (!run)
      return {
        ok: false,
        error: {
          code: "DIRECTOR_REVIEW_REQUIRED",
          message: "A successful Director review is required.",
          storyId: story.id,
        },
      };
    if (
      run.role !== "editor_in_chief" ||
      run.operation !== "article_review" ||
      run.outcome !== "succeeded" ||
      run.storyId !== story.id ||
      run.input.article.id !== article.article.id ||
      run.input.revision.id !== revision.id
    )
      return {
        ok: false,
        error: {
          code: "DIRECTOR_REVIEW_MISMATCH",
          message: "The Director review does not match the current Article Revision.",
          storyId: story.id,
        },
      };
    const decidedAt = dependencies.now();
    const created = createReviewDecision({
      id: dependencies.createDecisionId(),
      storyId: story.id,
      articleId: article.article.id,
      revisionId: revision.id,
      directorRunId: run.id,
      decision: command.decision,
      reason: command.reason,
      decidedBy: command.decidedBy,
      decidedAt,
    });
    if (!created.ok)
      return {
        ok: false,
        error: {
          code: "REVIEW_DECISION_REASON_REQUIRED",
          message: created.error.message,
          storyId: story.id,
        },
      };
    const transition = transitionStory({
      story,
      nextState: command.decision === "approve" ? "approved" : "changes_requested",
      actor: command.decidedBy,
      reason: created.decision.reason,
      transitionId: dependencies.createTransitionId(),
      occurredAt: decidedAt,
    });
    if (!transition.ok) return transition;
    return dependencies.persistence.persist({
      expectedStory: story,
      decision: created.decision,
      story: transition.story,
      transitionReceipt: transition.receipt,
    });
  };
}
