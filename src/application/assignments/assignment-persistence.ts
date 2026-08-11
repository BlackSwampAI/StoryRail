import type {
  AgentProfileId,
  Assignment,
  Story,
  StoryId,
  StoryTransitionReceipt,
} from "@/domain/editorial";

export interface PersistStoryAssignmentCommand {
  readonly expectedStory: Story;
  readonly assignment: Assignment;
  readonly story: Story;
  readonly transitionReceipt: StoryTransitionReceipt;
}

export type PersistStoryAssignmentResult =
  | {
      readonly ok: true;
      readonly assignment: Assignment;
      readonly story: Story;
      readonly transitionReceipt: StoryTransitionReceipt;
    }
  | {
      readonly ok: false;
      readonly error:
        | {
            readonly code: "STORY_ASSIGNMENT_CONFLICT";
            readonly message: string;
            readonly storyId: StoryId;
          }
        | {
            readonly code: "AGENT_PROFILE_NOT_FOUND";
            readonly message: string;
            readonly profileId: AgentProfileId;
          }
        | {
            readonly code: "AGENT_PROFILE_NOT_WRITER";
            readonly message: string;
            readonly profileId: AgentProfileId;
          };
    };

export interface AssignmentPersistence {
  persist(command: PersistStoryAssignmentCommand): Promise<PersistStoryAssignmentResult>;
}
