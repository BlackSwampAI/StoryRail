import type {
  AgentRun,
  Article,
  ArticleRevision,
  Story,
  StoryId,
  StoryTransitionReceipt,
} from "@/domain/editorial";

export interface PersistWriterDraftCommand {
  readonly expectedStory: Story;
  readonly run: Extract<AgentRun, { readonly role: "writer"; readonly outcome: "succeeded" }>;
  readonly article: Article;
  readonly revision: ArticleRevision;
  readonly story: Story;
  readonly transitionReceipt: StoryTransitionReceipt;
}

export type PersistWriterDraftResult =
  | {
      readonly ok: true;
      readonly run: PersistWriterDraftCommand["run"];
      readonly article: Article;
      readonly revision: ArticleRevision;
      readonly story: Story;
      readonly transitionReceipt: StoryTransitionReceipt;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "WRITER_DRAFT_CONFLICT";
        readonly message: string;
        readonly storyId: StoryId;
      };
    };

export interface WriterDraftPersistence {
  persist(command: PersistWriterDraftCommand): Promise<PersistWriterDraftResult>;
}
