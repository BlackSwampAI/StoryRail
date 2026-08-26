import type { ArticleRevisionId, StoryDeliveryId, StoryId } from "./types";

export const DELIVERY_FAILURE_CODES = [
  /** The destination could not be reached at all — no response, or one that never arrived. */
  "DESTINATION_UNREACHABLE",
  /** The destination understood the request and declined it, a slug already in use among them. */
  "DESTINATION_REJECTED",
  /** The destination refused the credential it was given. */
  "DESTINATION_UNAUTHORIZED",
  /** The destination answered with something this system cannot read as an outcome. */
  "DESTINATION_RESPONSE_INVALID",
] as const;
export type DeliveryFailureCode = (typeof DELIVERY_FAILURE_CODES)[number];

/**
 * A delivery records what was sent and what came back, never the Article itself. The Revision is
 * already durable and immutable; a copy here would be a second version of the same prose with no
 * way to say which one the newsroom stands behind.
 */
export const MAXIMUM_DELIVERY_RECORD_CHARACTERS = 4_000;

/**
 * Whether this delivery made the page or changed one StoryRail had already made. It is decided
 * from the record of prior deliveries rather than from asking the destination what exists.
 */
export const DELIVERY_OPERATIONS = ["create", "update"] as const;
export type DeliveryOperation = (typeof DELIVERY_OPERATIONS)[number];

export interface StoryDeliveryRequest {
  readonly operation: DeliveryOperation;
  /**
   * The address the page was written to, and the only identifier a delivery holds before it is
   * made, because it is the only one StoryRail chooses. If a process dies mid-request, the slug
   * is what an operator has to find the page it left behind.
   */
  readonly slug: string;
  readonly draft: boolean;
  /** The size of the body that was sent, so the record can say how much without holding it. */
  readonly bodyCharacters: number;
}

/**
 * What the destination said, and — when it did not keep the address it was asked for — which
 * address it used instead.
 *
 * WordPress silently uniquifies a colliding slug, so a delivery that asked for `great-black-swamp`
 * can create `great-black-swamp-2` and report success. Both are recorded because the post plainly
 * exists: calling that `failed` would leave a record unable to say what happened to a page that
 * is on a website. The pair is present only when the two differ, so its presence is the fact.
 */
export interface StoryDeliveryOutcomeResult {
  readonly status: number;
  readonly message: string | null;
  readonly requestedSlug?: string;
  readonly assignedSlug?: string;
}

interface StoryDeliveryCommon {
  readonly id: StoryDeliveryId;
  readonly storyId: StoryId;
  readonly revisionId: ArticleRevisionId;
  /**
   * The registered name of the destination, kept open rather than a closed list. Which
   * destinations exist is an operator's decision, so the record describes what was delivered to
   * instead of constraining what may be.
   */
  readonly destination: string;
  /**
   * What the destination calls the page, or null until it says. The create endpoint discards
   * any identifier sent with the request and mints its own, so a delivery cannot know one in
   * advance and must not claim to. A delivery that updates a page carries it from the start,
   * because the prior successful delivery is where it came from.
   */
  readonly remoteId: string | null;
  readonly request: StoryDeliveryRequest;
  readonly startedAt: string;
}

export type StoryDelivery = StoryDeliveryCommon &
  /**
   * Recorded before the request leaves. A delivery that was written afterwards could not
   * describe the one case that matters: a process that died having already put a page on a
   * website.
   */
  (
    | { readonly outcome: "running"; readonly completedAt: null }
    | {
        readonly outcome: "succeeded";
        readonly completedAt: string;
        /** An accepted delivery always knows which page it wrote, so this narrows to a string. */
        readonly remoteId: string;
        readonly result: StoryDeliveryOutcomeResult;
      }
    | {
        readonly outcome: "failed";
        readonly completedAt: string;
        readonly failure: {
          readonly code: DeliveryFailureCode;
          readonly message: string | null;
        };
      }
  );

export type StoryDeliveryValidationCode =
  | "STORY_DELIVERY_IDENTITY_INVALID"
  | "STORY_DELIVERY_REQUEST_INVALID"
  | "STORY_DELIVERY_RECORD_TOO_LARGE"
  | "STORY_DELIVERY_OUTCOME_INVALID";

export type RecordStoryDeliveryResult =
  | { readonly ok: true; readonly delivery: StoryDelivery }
  | {
      readonly ok: false;
      readonly error: { readonly code: StoryDeliveryValidationCode; readonly message: string };
    };
