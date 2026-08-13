import type { StoryInspectionRepository } from "@/application/story-inspection";
import {
  transitionStory,
  type OperatorActor,
  type StoryId,
  type StoryTransitionError,
  type TransitionId,
} from "@/domain/editorial";
import type {
  PersistReviewSubmissionResult,
  ReviewSubmissionPersistence,
} from "./review-submission-persistence";

export type SubmitStoryReviewResult =
  | Extract<PersistReviewSubmissionResult, { readonly ok: true }>
  | {
      readonly ok: false;
      readonly error:
        | StoryTransitionError
        | Extract<PersistReviewSubmissionResult, { readonly ok: false }>["error"]
        | {
            readonly code:
              | "STORY_NOT_FOUND"
              | "REVIEW_SUBMISSION_NOT_ALLOWED"
              | "ASSIGNMENT_REQUIRED"
              | "ARTICLE_REQUIRED"
              | "ARTICLE_REVISION_REQUIRED";
            readonly message: string;
            readonly storyId: StoryId;
          };
    };

export function createSubmitStoryReview(dependencies: {
  readonly inspections: StoryInspectionRepository;
  readonly persistence: ReviewSubmissionPersistence;
  readonly createTransitionId: () => TransitionId;
  readonly now: () => string;
}) {
  return async (command: {
    readonly storyId: StoryId;
    readonly submittedBy: OperatorActor;
  }): Promise<SubmitStoryReviewResult> => {
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
    const { story, assignment, article } = inspected.inspection;
    if (story.state !== "in_progress")
      return {
        ok: false,
        error: {
          code: "REVIEW_SUBMISSION_NOT_ALLOWED",
          message: "Only an In Progress Story can be submitted for review.",
          storyId: story.id,
        },
      };
    if (!assignment)
      return {
        ok: false,
        error: {
          code: "ASSIGNMENT_REQUIRED",
          message: "A durable Assignment is required.",
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
    if (article.revisions.length === 0)
      return {
        ok: false,
        error: {
          code: "ARTICLE_REVISION_REQUIRED",
          message: "A current Article Revision is required.",
          storyId: story.id,
        },
      };
    const transition = transitionStory({
      story,
      nextState: "in_review",
      actor: command.submittedBy,
      reason: "Operator submitted the current Article revision for editorial review.",
      transitionId: dependencies.createTransitionId(),
      occurredAt: dependencies.now(),
    });
    if (!transition.ok) return transition;
    return dependencies.persistence.persist({
      expectedStory: story,
      story: transition.story,
      transitionReceipt: transition.receipt,
    });
  };
}
