import type {
  AgentProfile,
  AgentRun,
  Article,
  ArticleRevision,
  Assignment,
  SourceExtraction,
  SourceEvidencePreparation,
  Story,
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
