import type { StoryDelivery, StoryId } from "@/domain/editorial";

export type AppendStoryDeliveryResult =
  | { readonly ok: true; readonly delivery: StoryDelivery }
  | {
      readonly ok: false;
      readonly error: { readonly code: "STORY_DELIVERY_ID_CONFLICT"; readonly message: string };
    };

export type CompleteStoryDeliveryResult =
  | { readonly ok: true; readonly delivery: StoryDelivery }
  | {
      readonly ok: false;
      readonly error: { readonly code: "STORY_DELIVERY_NOT_RUNNING"; readonly message: string };
    };

/**
 * The intent to deliver is recorded before the request leaves, and completed afterwards.
 *
 * Reaching outside the system is the act that must not be able to happen unrecorded. A record
 * written after the response could not describe a process that died having already created a
 * page on a website, which is precisely the case an operator needs the record for.
 */
export interface StoryDeliveryRepository {
  append(delivery: StoryDelivery): Promise<AppendStoryDeliveryResult>;
  complete(delivery: StoryDelivery): Promise<CompleteStoryDeliveryResult>;
  /**
   * The most recent delivery of this Story to this destination that was accepted, which is how a
   * later Revision finds the page to update. The record is the authority on what StoryRail has
   * put there; the destination is never asked what exists, because a page an operator made by
   * hand is not one this system created.
   */
  findLatestSucceeded(query: {
    readonly storyId: StoryId;
    readonly destination: string;
  }): Promise<StoryDelivery | null>;
  listByStoryId(storyId: StoryId): Promise<readonly StoryDelivery[]>;
}
