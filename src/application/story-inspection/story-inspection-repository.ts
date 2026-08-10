import type {
  SourceExtraction,
  Story,
  StoryId,
  StorySourceAttachment,
  UrlSource,
} from "@/domain/editorial";

export interface StoryInspectionSource {
  readonly attachment: StorySourceAttachment;
  readonly source: UrlSource;
  readonly extractions: readonly SourceExtraction[];
}

export interface StoryInspection {
  readonly story: Story;
  readonly sources: readonly StoryInspectionSource[];
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
