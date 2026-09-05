import type { StoryInspectionRepository } from "@/application/story-inspection";
import {
  articleBodyMarkdown,
  recordStoryDelivery,
  storyDeliverySlug,
  type ArticleRevision,
  type CredentialUnavailableError,
  type DeliveryFailureCode,
  type StoryDelivery,
  type StoryDeliveryId,
  type StoryId,
  type DestinationInstanceId,
} from "@/domain/editorial";

import type { DeliveryDestinationDirectory } from "./delivery-destination";
import type { LegacyDeliveryMappingResolutionRepository } from "./legacy-delivery-mapping-resolution-repository";
import type { StoryDeliveryRepository } from "./story-delivery-repository";
import type { StoryDeliveryReconciliationRepository } from "./story-delivery-reconciliation-repository";

export type DeliverStoryResult =
  | { readonly ok: true; readonly delivery: StoryDelivery }
  | {
      readonly ok: false;
      readonly delivery?: StoryDelivery;
      readonly error: {
        readonly code: "DESTINATION_MAPPING_REQUIRES_REVIEW";
        readonly message: string;
        readonly legacyDeliveryId: StoryDeliveryId;
        readonly destination: string;
        readonly destinationInstanceId: DestinationInstanceId;
        readonly remoteId: string;
      };
    }
  | {
      readonly ok: false;
      readonly delivery?: StoryDelivery;
      readonly error: {
        readonly code: "DESTINATION_RECONCILIATION_REQUIRED";
        readonly message: string;
        readonly deliveryId: StoryDeliveryId;
        readonly destination: string;
        readonly destinationInstanceId: DestinationInstanceId;
        readonly operation: "create" | "update";
        readonly slug: string;
        readonly remoteId: string | null;
      };
    }
  | {
      readonly ok: false;
      readonly delivery?: StoryDelivery;
      readonly error:
        | CredentialUnavailableError
        | {
            readonly code:
              | DeliveryFailureCode
              | "STORY_NOT_FOUND"
              | "STORY_NOT_PUBLISHED"
              | "STORY_HAS_NO_ARTICLE"
              | "DESTINATION_NOT_CONFIGURED"
              | "STORY_DELIVERY_NOT_RECORDED";
            readonly message: string;
          };
    };

export type DeliverStoryWorkflow = (command: {
  readonly storyId: StoryId;
}) => Promise<DeliverStoryResult>;

function latestRevision(revisions: readonly ArticleRevision[]): ArticleRevision | undefined {
  return [...revisions].sort((left, right) => left.revisionNumber - right.revisionNumber).at(-1);
}

/**
 * Delivery is the separate concern publication deliberately left alone: publishing declares a
 * Story ready to go, and this puts it somewhere. It can fail without unmaking that decision, so
 * it is recorded as a fact of its own rather than as part of the transition.
 *
 * The order here is the whole point. The credential is resolved first, because work that was
 * never attempted is never written down. The record is then written while the delivery is still
 * an intention, before anything leaves the process. Nothing is retried: a failed delivery stays
 * failed and an operator asks for a new one, which is a new row, because a retry that succeeded
 * after a failure nobody saw would leave a record unable to say what happened.
 */
export function createDeliverStory(dependencies: {
  readonly inspections: StoryInspectionRepository;
  readonly deliveries: StoryDeliveryRepository;
  readonly resolutions: LegacyDeliveryMappingResolutionRepository;
  readonly reconciliations: StoryDeliveryReconciliationRepository;
  readonly destinations: DeliveryDestinationDirectory;
  readonly createDeliveryId: () => StoryDeliveryId;
  readonly now: () => string;
}): DeliverStoryWorkflow {
  return async (command) => {
    const inspected = await dependencies.inspections.inspect(command.storyId);
    if (!inspected.ok)
      return {
        ok: false,
        error: { code: "STORY_NOT_FOUND", message: "The Story does not exist." },
      };

    // The publication decision's timestamp is deliberately not sent. The destination stamps both
    // publishedAt and updatedAt with its own clock and ignores whatever arrives, so a system that
    // sent one would be claiming to carry a date across that never survives the journey.
    const { story, article } = inspected.inspection;
    // Only a published Story is delivered. Delivering anything earlier would put work in front
    // of readers that the newsroom has not yet decided is ready to be seen.
    if (story.state !== "published")
      return {
        ok: false,
        error: {
          code: "STORY_NOT_PUBLISHED",
          message: "Only a published Story is delivered to a destination.",
        },
      };

    const revision = article ? latestRevision(article.revisions) : undefined;
    if (!revision)
      return {
        ok: false,
        error: {
          code: "STORY_HAS_NO_ARTICLE",
          message: "The Story has no Article Revision to deliver.",
        },
      };

    const resolved = await dependencies.destinations.resolve();
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const destination = resolved.destination;

    // An unknowable external outcome is a hard gate. Retrying it could duplicate a page; using
    // an older success could overwrite the wrong one. Only an exact operator decision for this
    // attempt and installation can establish the identity used by the next request.
    const unresolved = await dependencies.deliveries.findLatestUnresolved({
      storyId: story.id,
      destinationInstanceId: destination.instanceId,
    });
    let reconciledRemoteId: string | null | undefined;
    if (unresolved) {
      const reconciliation = await dependencies.reconciliations.findLatest({
        storyId: story.id,
        deliveryId: unresolved.id,
        destinationInstanceId: destination.instanceId,
      });
      const matchesSnapshot =
        reconciliation?.storyId === unresolved.storyId &&
        reconciliation.deliveryId === unresolved.id &&
        reconciliation.destination === unresolved.destination &&
        reconciliation.destinationInstanceId === unresolved.destinationInstanceId &&
        reconciliation.operation === unresolved.request.operation &&
        reconciliation.slug === unresolved.request.slug;
      if (!matchesSnapshot)
        return {
          ok: false,
          error: {
            code: "DESTINATION_RECONCILIATION_REQUIRED",
            message: "The previous delivery outcome must be reconciled before delivering again.",
            deliveryId: unresolved.id,
            destination: unresolved.destination,
            destinationInstanceId: destination.instanceId,
            operation: unresolved.request.operation,
            slug: unresolved.request.slug,
            remoteId: unresolved.remoteId,
          },
        };
      // "Not delivered" rejects only this attempt's outcome. An update still names a mapping
      // verified by an earlier reconciliation, so forgetting its target here would turn the next
      // request into a duplicate create.
      reconciledRemoteId =
        reconciliation.decision === "delivered"
          ? reconciliation.remoteId
          : unresolved.request.operation === "update"
            ? unresolved.remoteId
            : null;
    }

    // The prior successful delivery decides create against update, so a Story a Director sent
    // back and a Writer revised keeps the one page it already has rather than gaining a second.
    const prior = await dependencies.deliveries.findLatestSucceeded({
      storyId: story.id,
      destinationInstanceId: destination.instanceId,
    });
    let resolvedLegacyRemoteId: string | null = null;
    if (!prior) {
      const legacy = await dependencies.deliveries.findLatestLegacySucceeded({
        storyId: story.id,
        destination: destination.name,
      });
      if (legacy) {
        const legacyRemoteId = legacy.remoteId;
        if (legacyRemoteId === null)
          return {
            ok: false,
            error: {
              code: "STORY_DELIVERY_NOT_RECORDED",
              message: "The successful legacy delivery does not identify its remote post.",
            },
          };
        const resolution = await dependencies.resolutions.findLatest({
          storyId: story.id,
          legacyDeliveryId: legacy.id,
          destinationInstanceId: destination.instanceId,
        });
        const matchesSnapshot =
          resolution?.storyId === story.id &&
          resolution.legacyDeliveryId === legacy.id &&
          resolution.destination === legacy.destination &&
          resolution.destinationInstanceId === destination.instanceId &&
          resolution.remoteId === legacyRemoteId;
        if (!matchesSnapshot)
          return {
            ok: false,
            error: {
              code: "DESTINATION_MAPPING_REQUIRES_REVIEW",
              message:
                "A legacy delivery mapping must be confirmed or dismissed before delivering again.",
              legacyDeliveryId: legacy.id,
              destination: legacy.destination,
              destinationInstanceId: destination.instanceId,
              remoteId: legacyRemoteId,
            },
          };
        if (resolution.decision === "confirm") resolvedLegacyRemoteId = resolution.remoteId;
      }
    }
    // An exact successful delivery always wins. Otherwise a matching confirmation adopts the
    // immutable legacy snapshot; a dismissal deliberately starts a new destination page.
    const remoteId = prior?.remoteId ?? reconciledRemoteId ?? resolvedLegacyRemoteId;
    const bodyMarkdown = articleBodyMarkdown(revision.blocks);
    const slug = storyDeliverySlug(revision.headline);
    const startedAt = dependencies.now();

    const running = recordStoryDelivery({
      id: dependencies.createDeliveryId(),
      storyId: story.id,
      revisionId: revision.id,
      destination: destination.name,
      destinationInstanceId: destination.instanceId,
      // Null on a first delivery. The destination mints the identifier and discards any sent to
      // it, so a running row that named one would name a page that does not exist under that
      // name. The slug it does carry is the identifier StoryRail chose and the destination keeps.
      remoteId,
      request: {
        operation: remoteId === null ? "create" : "update",
        slug,
        draft: destination.draft,
        bodyCharacters: bodyMarkdown.length,
      },
      startedAt,
      outcome: "running",
      completedAt: null,
    });
    if (!running.ok)
      return {
        ok: false,
        error: {
          code: "STORY_DELIVERY_NOT_RECORDED",
          message: running.error.message,
        },
      };

    const appended = await dependencies.deliveries.append(running.delivery);
    // Nothing leaves the process until the intent is durable. A delivery that could not be
    // written down is one that must not happen at all.
    if (!appended.ok)
      return {
        ok: false,
        error: { code: "STORY_DELIVERY_NOT_RECORDED", message: appended.error.message },
      };

    const attempt = await destination.deliver({
      storyId: story.id,
      revisionId: revision.id,
      slug,
      headline: revision.headline,
      dek: revision.dek,
      bodyMarkdown,
      blocks: revision.blocks,
      draft: running.delivery.request.draft,
      ...(remoteId === null
        ? { operation: "create" as const, remoteId: null }
        : { operation: "update" as const, remoteId }),
    });

    const completed = recordStoryDelivery(
      attempt.ok === true
        ? {
            ...running.delivery,
            outcome: "succeeded",
            completedAt: dependencies.now(),
            // The identifier is learned here, on the way back. It is the one moment a delivery's
            // remote_id may change, and only from having named nothing to naming the page.
            remoteId: attempt.remoteId,
            result: attempt.result,
          }
        : attempt.ok === false
          ? {
              ...running.delivery,
              outcome: "failed",
              completedAt: dependencies.now(),
              failure: attempt.failure,
            }
          : {
              ...running.delivery,
              outcome: "unknown",
              completedAt: dependencies.now(),
              uncertainty: attempt.uncertainty,
            },
    );
    if (!completed.ok)
      return {
        ok: false,
        error: { code: "STORY_DELIVERY_NOT_RECORDED", message: completed.error.message },
      };

    const written = await dependencies.deliveries.complete(completed.delivery);
    if (!written.ok)
      return {
        ok: false,
        error: { code: "STORY_DELIVERY_NOT_RECORDED", message: written.error.message },
      };

    return attempt.ok === true
      ? { ok: true, delivery: written.delivery }
      : attempt.ok === false
        ? {
            ok: false,
            delivery: written.delivery,
            error: {
              code: attempt.failure.code,
              message: attempt.failure.message ?? "The destination did not accept the delivery.",
            },
          }
        : {
            ok: false,
            delivery: written.delivery,
            error: {
              code: "DESTINATION_RECONCILIATION_REQUIRED",
              message:
                attempt.uncertainty.message ??
                "The destination may have accepted the delivery; operator reconciliation is required.",
              deliveryId: written.delivery.id,
              destination: written.delivery.destination,
              destinationInstanceId: destination.instanceId,
              operation: written.delivery.request.operation,
              slug: written.delivery.request.slug,
              remoteId: written.delivery.remoteId,
            },
          };
  };
}
