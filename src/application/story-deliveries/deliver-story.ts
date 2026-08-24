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
} from "@/domain/editorial";

import type { DeliveryDestinationDirectory } from "./delivery-destination";
import type { StoryDeliveryRepository } from "./story-delivery-repository";

export type DeliverStoryResult =
  | { readonly ok: true; readonly delivery: StoryDelivery }
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

    // The prior successful delivery decides create against update, so a Story a Director sent
    // back and a Writer revised keeps the one page it already has rather than gaining a second.
    const prior = await dependencies.deliveries.findLatestSucceeded({
      storyId: story.id,
      destination: destination.name,
    });
    const remoteId = prior?.remoteId ?? null;
    const bodyMarkdown = articleBodyMarkdown(revision.blocks);
    const slug = storyDeliverySlug(revision.headline);
    const startedAt = dependencies.now();

    const running = recordStoryDelivery({
      id: dependencies.createDeliveryId(),
      storyId: story.id,
      revisionId: revision.id,
      destination: destination.name,
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
      draft: running.delivery.request.draft,
      ...(remoteId === null
        ? { operation: "create" as const, remoteId: null }
        : { operation: "update" as const, remoteId }),
    });

    const completed = recordStoryDelivery(
      attempt.ok
        ? {
            ...running.delivery,
            outcome: "succeeded",
            completedAt: dependencies.now(),
            // The identifier is learned here, on the way back. It is the one moment a delivery's
            // remote_id may change, and only from having named nothing to naming the page.
            remoteId: attempt.remoteId,
            result: attempt.result,
          }
        : {
            ...running.delivery,
            outcome: "failed",
            completedAt: dependencies.now(),
            failure: attempt.failure,
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

    return attempt.ok
      ? { ok: true, delivery: written.delivery }
      : {
          ok: false,
          delivery: written.delivery,
          error: {
            code: attempt.failure.code,
            message: attempt.failure.message ?? "The destination did not accept the delivery.",
          },
        };
  };
}
