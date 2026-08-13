import type {
  AgentRun,
  ArticleRevision,
  Story,
  StoryId,
  StoryTransitionReceipt,
} from "@/domain/editorial";

export interface PersistWriterRevisionCommand {
  readonly expectedStory: Story;
  readonly expectedRevision: ArticleRevision;
  readonly run: Extract<
    AgentRun,
    {
      readonly role: "writer";
      readonly operation: "article_revision";
      readonly outcome: "succeeded";
    }
  >;
  readonly revision: ArticleRevision;
  readonly story: Story;
  readonly transitionReceipt: StoryTransitionReceipt;
}

export type PersistWriterRevisionResult =
  | {
      readonly ok: true;
      readonly run: PersistWriterRevisionCommand["run"];
      readonly revision: ArticleRevision;
      readonly story: Story;
      readonly transitionReceipt: StoryTransitionReceipt;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "WRITER_REVISION_CONFLICT";
        readonly message: string;
        readonly storyId: StoryId;
      };
    };

export interface WriterRevisionPersistence {
  persist(command: PersistWriterRevisionCommand): Promise<PersistWriterRevisionResult>;
}
