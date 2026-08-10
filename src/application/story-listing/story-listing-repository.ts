import type { Story } from "@/domain/editorial";

export interface StoryListItem {
  readonly story: Story;
  readonly sourceCount: number;
}

export interface StoryListingRepository {
  list(): Promise<readonly StoryListItem[]>;
}
