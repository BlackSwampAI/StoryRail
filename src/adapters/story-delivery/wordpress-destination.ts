import type {
  DeliveryAttemptResult,
  DeliveryDestination,
  DeliveryRequest,
} from "@/application/story-deliveries";
import {
  siteDestinationInstanceId,
  type SiteDestinationSettings,
  type StoryDeliveryOutcomeResult,
} from "@/domain/editorial";

import { bounded, failureCodeFor, isRecord, readJsonBody } from "./destination-response";
import { gutenbergBlocks } from "./gutenberg-blocks";

/** The name every delivery through this connector is recorded against. */
export const WORDPRESS_DESTINATION_NAME = "wordpress";

export interface WordPressDestinationOptions {
  readonly settings: Extract<SiteDestinationSettings, { kind: "wordpress" }>;
  /**
   * A WordPress Application Password, sent exactly as it was stored. Its display spaces are
   * accepted by WordPress, so stripping them would only risk altering a password that works.
   */
  readonly applicationPassword: string;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Delivers a Revision to a WordPress install through the core REST API.
 *
 * WordPress answers a create with the whole post, identifier included, so nothing here invents an
 * identity: the delivery learns it on the way back and records it on completion. Which post a
 * later Revision updates comes from the prior successful delivery, never from asking WordPress
 * what it already has — discovering a post remotely would let StoryRail adopt and overwrite a
 * page it never made.
 */
export function createWordPressDestination(
  options: WordPressDestinationOptions,
): DeliveryDestination {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const authorization = `Basic ${Buffer.from(`${options.settings.username}:${options.applicationPassword}`, "utf8").toString("base64")}`;

  return {
    name: WORDPRESS_DESTINATION_NAME,
    instanceId: siteDestinationInstanceId(options.settings),
    draft: options.settings.draft,

    async deliver(request: DeliveryRequest): Promise<DeliveryAttemptResult> {
      const creating = request.operation === "create";
      // WordPress updates a post with POST to its own address. There is no PATCH route, and
      // sending one answers 404 as though the post did not exist.
      const endpoint = creating
        ? `${options.settings.baseUrl}/wp-json/wp/v2/posts`
        : `${options.settings.baseUrl}/wp-json/wp/v2/posts/${encodeURIComponent(request.remoteId)}`;

      let response: Response;
      try {
        response = await fetchImplementation(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authorization },
          // No date is sent. WordPress stamps its own and a date claimed here would not survive
          // the journey, so sending one would only look like provenance carried across.
          body: JSON.stringify({
            title: request.headline,
            excerpt: request.dek ?? "",
            content: gutenbergBlocks(request.blocks),
            slug: request.slug,
            status: options.settings.draft ? "draft" : "publish",
          }),
        });
      } catch (caught) {
        return {
          ok: null,
          uncertainty: {
            code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN",
            message: bounded(caught instanceof Error ? caught.message : "The request failed."),
          },
        };
      }

      const read = await readJsonBody(response);
      // A body that cannot be read on a successful status is an outcome nothing can vouch for,
      // so it is recorded as unknown rather than as either success or failure.
      if (!read.ok)
        return {
          ...(response.ok
            ? {
                ok: null,
                uncertainty: {
                  code: "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE" as const,
                  message: `The destination answered ${response.status} with a body that is not JSON.`,
                },
              }
            : {
                ok: false as const,
                failure: {
                  code: failureCodeFor(response.status),
                  message: `The destination answered ${response.status} with a body that is not JSON.`,
                },
              }),
        };

      const body = read.body;
      const message =
        isRecord(body) && typeof body.message === "string" ? bounded(body.message) : null;

      if (!response.ok)
        return {
          ok: false,
          failure: {
            code: failureCodeFor(response.status),
            message: message ?? bounded(`The destination answered ${response.status}.`),
          },
        };

      // The identifier is a number in the REST API and a string everywhere in StoryRail. Only a
      // create reads it: an update already knows which post it wrote, and taking the answer's id
      // there would let a delivery quietly change which post it says it made.
      //
      // A create whose id cannot be read is recorded as unknown rather than as a success naming
      // nothing, and the next delivery is gated for reconciliation instead of creating again.
      const identifier = isRecord(body) ? body.id : undefined;
      const created =
        typeof identifier === "number" && Number.isInteger(identifier)
          ? String(identifier)
          : typeof identifier === "string" && identifier.trim().length > 0
            ? identifier.trim()
            : null;
      const remoteId = creating ? created : request.remoteId;
      if (remoteId === null)
        return {
          ok: null,
          uncertainty: {
            code: "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
            message: message
              ? `The destination accepted the post but named no id: ${message}`
              : "The destination accepted the post and said nothing about it.",
          },
        };

      // WordPress uniquifies a slug already in use — ask for `great-black-swamp` and get
      // `great-black-swamp-2` with no error at all. The post exists, so this is a success, but
      // it is at an address nobody chose, and a record that did not name both would leave an
      // operator hunting for a page StoryRail could no longer point at.
      const assignedSlug =
        isRecord(body) && typeof body.slug === "string" && body.slug.trim().length > 0
          ? body.slug.trim()
          : request.slug;
      const result: StoryDeliveryOutcomeResult =
        assignedSlug === request.slug
          ? { status: response.status, message }
          : {
              status: response.status,
              message,
              requestedSlug: request.slug,
              assignedSlug,
            };

      return { ok: true, remoteId, result };
    },
  };
}
