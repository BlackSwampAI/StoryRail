import type {
  DeliveryAttemptResult,
  DeliveryDestination,
  DeliveryRequest,
} from "@/application/story-deliveries";
import type { DeliveryFailureCode, SiteDestinationSettings } from "@/domain/editorial";

/** The name every delivery through this connector is recorded against. */
export const STUDIOCMS_DESTINATION_NAME = "studiocms";

/**
 * This install stores one language per page and calls it `default`. It is a constant rather than
 * a setting because a newsroom choosing a language it does not have would only ever produce a
 * page nothing renders.
 */
export const STUDIOCMS_CONTENT_LANGUAGE = "default";

/**
 * What the destination said, kept short. The record is an audit fact about the exchange, not a
 * place to keep a page of HTML an error handler happened to return.
 */
export const MAXIMUM_DESTINATION_MESSAGE_CHARACTERS = 500;

/**
 * The only place the identifier of a created page can be read.
 *
 * The create endpoint discards any id sent to it, mints its own, and reports it in prose. There
 * is no field to read it from, so it is parsed — tightly, because a message that does not match
 * this exactly is a message whose id we would be guessing at.
 */
const CREATED_PAGE_ID = /^Page created successfully with id: ([0-9a-zA-Z-]+)$/;

/**
 * Booleans cross the wire as numbers: the destination decodes them through a schema whose encoded
 * side is numeric, and answers a bare 400 for a JSON `true`. The setting stays a boolean in
 * StoryRail; only the encoding is numeric.
 */
const wireBoolean = (value: boolean): number => (value ? 1 : 0);

export interface StudioCmsDestinationOptions {
  readonly settings: SiteDestinationSettings;
  readonly apiToken: string;
  readonly fetch?: typeof globalThis.fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bounded(message: string): string | null {
  const trimmed = message.trim().slice(0, MAXIMUM_DESTINATION_MESSAGE_CHARACTERS).trim();
  return trimmed.length > 0 ? trimmed : null;
}

// A refusal and an inability to answer are different facts for an operator: the first is fixed
// by changing what was sent, the second by waiting or by fixing the far end. So a status the
// destination chose deliberately reads as rejection, and one that means it could not answer at
// all reads as unreachable.
function failureCodeFor(status: number): DeliveryFailureCode {
  if (status === 401 || status === 403) return "DESTINATION_UNAUTHORIZED";
  if (status >= 500 || status === 408 || status === 429) return "DESTINATION_UNREACHABLE";
  return "DESTINATION_REJECTED";
}

/**
 * Delivers a Revision to a StudioCMS install.
 *
 * It sends the page identifier rather than reading one back, because the create endpoint answers
 * with a message and no identifier at all. Choosing the id is what lets StoryRail know which page
 * it made even when the response never arrives, and what lets the delivery record name the page
 * before the request leaves.
 */
export function createStudioCmsDestination(
  options: StudioCmsDestinationOptions,
): DeliveryDestination {
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  return {
    name: STUDIOCMS_DESTINATION_NAME,
    draft: options.settings.draft,

    async deliver(request: DeliveryRequest): Promise<DeliveryAttemptResult> {
      const creating = request.operation === "create";
      const endpoint = creating
        ? `${options.settings.baseUrl}/pages`
        : `${options.settings.baseUrl}/pages/${encodeURIComponent(request.remoteId)}`;

      let response: Response;
      try {
        response = await fetchImplementation(endpoint, {
          method: creating ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiToken}`,
          },
          // No id, no author, and no publication date. The destination mints the id itself,
          // attributes the page to whoever owns the token, and stamps both dates with its own
          // clock, discarding all three if they are sent. Sending them would only make this look
          // like it decided things it does not decide.
          body: JSON.stringify({
            data: {
              title: request.headline,
              description: request.dek ?? "",
              slug: request.slug,
              package: options.settings.package,
              contentLang: STUDIOCMS_CONTENT_LANGUAGE,
              draft: wireBoolean(options.settings.draft),
              showOnNav: wireBoolean(false),
              showAuthor: wireBoolean(false),
              showContributors: wireBoolean(false),
              // Only a handful of columns are defaulted at the far end; the rest are inserted as
              // they arrive, so one left out is a not-null violation reported as a bare 500.
              // These four decode from a JSON string on the wire, hence "[]" rather than [].
              categories: "[]",
              tags: "[]",
              contributorIds: "[]",
              augments: "[]",
              heroImage: "",
              parentFolder: null,
            },
            content: { content: request.bodyMarkdown },
          }),
        });
      } catch (caught) {
        return {
          ok: false,
          failure: {
            code: "DESTINATION_UNREACHABLE",
            message: bounded(caught instanceof Error ? caught.message : "The request failed."),
          },
        };
      }

      let body: unknown;
      let text: string;
      try {
        text = await response.text();
        body = text.trim().length > 0 ? JSON.parse(text) : null;
      } catch {
        // An unreadable body on a successful status is still an outcome nothing can vouch for,
        // so it is recorded as an invalid response rather than as a delivery that worked.
        return {
          ok: false,
          failure: {
            code: response.ok ? "DESTINATION_RESPONSE_INVALID" : failureCodeFor(response.status),
            message: `The destination answered ${response.status} with a body that is not JSON.`,
          },
        };
      }

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

      // An update already knows which page it wrote. A create only learns it from the message,
      // and one that cannot be read is recorded as a failure rather than as a success naming
      // nothing: the next Revision would otherwise make a second page instead of updating this.
      const remoteId = creating
        ? (CREATED_PAGE_ID.exec(message ?? "")?.[1] ?? null)
        : request.remoteId;
      if (remoteId === null)
        return {
          ok: false,
          failure: {
            code: "DESTINATION_RESPONSE_INVALID",
            message: message
              ? `The destination accepted the page but named no id: ${message}`
              : "The destination accepted the page and said nothing about it.",
          },
        };

      return { ok: true, remoteId, result: { status: response.status, message } };
    },
  };
}
