import type {
  AgentActor,
  SourceExtraction,
  StoryId,
  StorySourceAttachment,
  UrlSource,
} from "@/domain/editorial";

export type AttachResearchedSourceResult =
  | {
      readonly ok: true;
      readonly source: UrlSource;
      readonly extraction: SourceExtraction;
      readonly attachment: StorySourceAttachment;
    }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

/**
 * Persists a researched Source, its extraction, and its attachment as one act. A Source that
 * exists without the evidence behind it, or an attachment to a Source nobody stored, would each
 * be a Story resting on something that is not there.
 */
export interface ResearchPersistence {
  attach(command: {
    readonly storyId: StoryId;
    readonly source: UrlSource;
    readonly extraction: SourceExtraction;
    readonly relevance: string;
    readonly attachedBy: AgentActor;
    readonly attachedAt: string;
  }): Promise<AttachResearchedSourceResult>;
}
