import type {
  ArticleBlock,
  ArticleRevisionId,
  CredentialUnavailableError,
  DestinationInstanceId,
  DeliveryFailureCode,
  StoryDeliveryOutcomeResult,
  StoryId,
} from "@/domain/editorial";

interface DeliveryRequestCommon {
  readonly storyId: StoryId;
  readonly revisionId: ArticleRevisionId;
  /** Chosen by StoryRail and honoured by the destination, unlike the identifier. */
  readonly slug: string;
  readonly headline: string;
  readonly dek: string | null;
  /** Derived from the Revision's blocks at the moment of delivery, never stored a second time. */
  readonly bodyMarkdown: string;
  /**
   * The Revision's blocks as they were written. A destination whose body format keeps structure
   * — WordPress stores separate editor blocks — serialises from these rather than parsing the
   * markdown back apart, because re-deriving a structure that was never lost is how the two
   * copies come to disagree.
   */
  readonly blocks: readonly ArticleBlock[];
  readonly draft: boolean;
}

/**
 * Everything a destination is told about a Revision, assembled once so it cannot vary by call.
 *
 * Whether there is a page already is carried in the type rather than checked at the far end: a
 * create has no identifier to send because the destination has not made one yet, and an update
 * has one because a prior successful delivery recorded it. Nothing has to remember to check.
 */
export type DeliveryRequest = DeliveryRequestCommon &
  (
    | { readonly operation: "create"; readonly remoteId: null }
    | { readonly operation: "update"; readonly remoteId: string }
  );

export type DeliveryAttemptResult =
  | {
      readonly ok: true;
      /**
       * What the destination calls the page. A create learns it here for the first time, because
       * the identifier it was sent — if any — is not the one the page ended up with.
       */
      readonly remoteId: string;
      readonly result: StoryDeliveryOutcomeResult;
    }
  | {
      readonly ok: false;
      readonly failure: { readonly code: DeliveryFailureCode; readonly message: string | null };
    };

/**
 * One configured place a Story can be delivered to. It never decides whether to record anything;
 * it makes the request and says what happened, so the audit record cannot depend on a connector
 * remembering to write it.
 */
export interface DeliveryDestination {
  /** The name recorded against every delivery made through it, such as `studiocms`. */
  readonly name: string;
  readonly instanceId: DestinationInstanceId;
  /**
   * Whether pages arrive unpublished. It is read from the destination rather than decided by the
   * workflow so that the audit record states what was actually sent, not what a caller assumed.
   */
  readonly draft: boolean;
  deliver(request: DeliveryRequest): Promise<DeliveryAttemptResult>;
}

export type ResolveDeliveryDestinationResult =
  | { readonly ok: true; readonly destination: DeliveryDestination }
  | {
      readonly ok: false;
      readonly error:
        | CredentialUnavailableError
        | { readonly code: "DESTINATION_NOT_CONFIGURED"; readonly message: string };
    };

/**
 * Resolves the Site's destination at the moment a delivery is asked for.
 *
 * It is asked before any record is written, because a credential that cannot be read means
 * nothing was ever attempted, and a running row for an attempt that never had a chance to run
 * would be a lie in the audit trail.
 */
export interface DeliveryDestinationDirectory {
  resolve(): Promise<ResolveDeliveryDestinationResult>;
}
