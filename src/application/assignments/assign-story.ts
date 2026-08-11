import type { AgentProfileRepository } from "@/application/agent-profiles";
import type { StoryInspectionRepository } from "@/application/story-inspection";
import type { StoryRepository } from "@/application/story-persistence";
import {
  createAssignment,
  transitionStory,
  type AgentProfileId,
  type AssignmentId,
  type AssignmentValidationError,
  type EditorialActor,
  type StoryId,
  type StoryTransitionError,
  type TransitionId,
} from "@/domain/editorial";

import type { AssignmentPersistence, PersistStoryAssignmentResult } from "./assignment-persistence";

export interface AssignStoryCommand {
  readonly storyId: StoryId;
  readonly writerProfileId: AgentProfileId;
  readonly angle: string;
  readonly brief: string;
  readonly constraints: string | null;
  readonly reason: string;
  readonly assignedBy: EditorialActor;
}

export type AssignStoryResult =
  | Extract<PersistStoryAssignmentResult, { readonly ok: true }>
  | {
      readonly ok: false;
      readonly error:
        | AssignmentValidationError
        | StoryTransitionError
        | Extract<PersistStoryAssignmentResult, { readonly ok: false }>["error"]
        | {
            readonly code: "STORY_NOT_FOUND";
            readonly message: "The Story to assign does not exist.";
            readonly storyId: StoryId;
          };
    };

export type AssignStoryWorkflow = (command: AssignStoryCommand) => Promise<AssignStoryResult>;

export interface CreateAssignStoryOptions {
  readonly storyRepository: StoryRepository;
  readonly agentProfileRepository: AgentProfileRepository;
  readonly inspectionRepository: StoryInspectionRepository;
  readonly assignmentPersistence: AssignmentPersistence;
  readonly createAssignmentId: () => AssignmentId;
  readonly createTransitionId: () => TransitionId;
  readonly now: () => string;
}

export function createAssignStory(options: CreateAssignStoryOptions): AssignStoryWorkflow {
  return async (command) => {
    const story = await options.storyRepository.findById(command.storyId);
    if (!story) {
      return {
        ok: false,
        error: {
          code: "STORY_NOT_FOUND",
          message: "The Story to assign does not exist.",
          storyId: command.storyId,
        },
      };
    }

    const profile = await options.agentProfileRepository.findById(command.writerProfileId);
    if (!profile) {
      return {
        ok: false,
        error: {
          code: "AGENT_PROFILE_NOT_FOUND",
          message: "The selected Agent Profile does not exist.",
          profileId: command.writerProfileId,
        },
      };
    }
    if (profile.role !== "writer") {
      return {
        ok: false,
        error: {
          code: "AGENT_PROFILE_NOT_WRITER",
          message: "The selected Agent Profile is not a Writer.",
          profileId: profile.id,
        },
      };
    }

    const inspection = await options.inspectionRepository.inspect(story.id);
    if (!inspection.ok) {
      return {
        ok: false,
        error: {
          code: "STORY_NOT_FOUND",
          message: "The Story to assign does not exist.",
          storyId: story.id,
        },
      };
    }
    const sourceIds = inspection.inspection.sources.map(({ source }) => source.id);
    const occurredAt = options.now();
    const assignmentResult = createAssignment({
      id: options.createAssignmentId(),
      storyId: story.id,
      writerProfileId: profile.id,
      sourceIds,
      angle: command.angle,
      brief: command.brief,
      constraints: command.constraints,
      assignedBy: command.assignedBy,
      assignedAt: occurredAt,
    });
    if (!assignmentResult.ok) return assignmentResult;

    const transition = transitionStory({
      story,
      nextState: "assigned",
      actor: command.assignedBy,
      reason: command.reason,
      transitionId: options.createTransitionId(),
      occurredAt,
    });
    if (!transition.ok) return transition;

    return options.assignmentPersistence.persist({
      expectedStory: story,
      assignment: assignmentResult.assignment,
      story: transition.story,
      transitionReceipt: transition.receipt,
    });
  };
}
