import type {
  AgentProfile,
  AgentRun,
  Article,
  ArticleRevision,
  Assignment,
  ReviewDecision,
  SourceExtraction,
  SourceEvidencePreparation,
  Story,
  StoryDelivery,
  StoryId,
  StorySourceAttachment,
  StoryTransitionReceipt,
  UrlSource,
} from "@/domain/editorial";

export interface StoryInspectionSource {
  readonly attachment: StorySourceAttachment;
  readonly source: UrlSource;
  readonly extractions: readonly SourceExtraction[];
  readonly preparations: readonly SourceEvidencePreparation[];
}

export interface StoryInspection {
  readonly story: Story;
  readonly sources: readonly StoryInspectionSource[];
  readonly assignment: {
    readonly assignment: Assignment;
    readonly writerProfile: AgentProfile;
  } | null;
  readonly transitions: readonly StoryTransitionReceipt[];
  readonly agentRuns: readonly AgentRun[];
  readonly article: {
    readonly article: Article;
    readonly revisions: readonly ArticleRevision[];
  } | null;
  readonly reviewDecisions: readonly ReviewDecision[];
  /**
   * Every attempt to put this Story somewhere outside StoryRail, in the order they were made.
   * Delivery travels with the rest of the Story's record rather than through a route of its own,
   * because a second read model of the same Story could answer "delivered" while this one still
   * answered "published and nowhere".
   */
  readonly deliveries: readonly StoryDelivery[];
}

export interface StoryInspectionNotFoundError {
  readonly code: "STORY_NOT_FOUND";
  readonly message: "The Story to inspect does not exist.";
  readonly storyId: StoryId;
}

export type InspectStoryResult =
  | {
      readonly ok: true;
      readonly inspection: StoryInspection;
    }
  | {
      readonly ok: false;
      readonly error: StoryInspectionNotFoundError;
    };

export interface StoryInspectionRepository {
  inspect(storyId: StoryId): Promise<InspectStoryResult>;
}
