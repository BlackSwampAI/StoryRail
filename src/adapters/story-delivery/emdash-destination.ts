import type {
  DeliveryAttemptResult,
  DeliveryDestination,
  DeliveryRequest,
} from "@/application/story-deliveries";
import { siteDestinationInstanceId, type SiteDestinationSettings } from "@/domain/editorial";

import { bounded, failureCodeFor, isRecord, readJsonBody } from "./destination-response";
import { emdashPortableText } from "./emdash-portable-text";

export const EMDASH_DESTINATION_NAME = "emdash";
const REQUEST_TIMEOUT_MS = 30_000;

export interface EmDashDestinationOptions {
  readonly settings: Extract<SiteDestinationSettings, { kind: "emdash" }>;
  readonly apiToken: string;
  readonly fetch?: typeof globalThis.fetch;
}

interface EmDashContentItem {
  readonly id: string;
  readonly type: string;
  readonly slug: string | null;
  readonly status: string;
}

interface EmDashContentResponse {
  readonly item: EmDashContentItem;
  readonly _rev?: string;
}

function contentEndpoint(
  settings: Extract<SiteDestinationSettings, { kind: "emdash" }>,
  id?: string,
) {
  return `${settings.baseUrl}/content/${encodeURIComponent(settings.collection)}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;
}

function readContentResponse(value: unknown, collection: string): EmDashContentResponse | null {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !isRecord(value.data) ||
    !isRecord(value.data.item)
  )
    return null;
  const item = value.data.item;
  if (
    typeof item.id !== "string" ||
    item.id.trim().length === 0 ||
    item.id !== item.id.trim() ||
    item.type !== collection ||
    !(typeof item.slug === "string" || item.slug === null) ||
    !(item.status === "draft" || item.status === "published" || item.status === "scheduled")
  )
    return null;
  return {
    item: { id: item.id, type: item.type, slug: item.slug, status: item.status },
    ...(typeof value.data._rev === "string" && value.data._rev.length > 0
      ? { _rev: value.data._rev }
      : {}),
  };
}

function responseMessage(value: unknown): string | null {
  if (isRecord(value) && isRecord(value.error) && typeof value.error.message === "string")
    return bounded(value.error.message);
  return null;
}

function unknown(
  code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN" | "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
  message: string,
): DeliveryAttemptResult {
  return { ok: null, uncertainty: { code, message: bounded(message) } };
}

function failed(status: number, message: string | null): DeliveryAttemptResult {
  return {
    ok: false,
    failure: {
      code: failureCodeFor(status),
      message: message ?? bounded(`The destination answered ${status}.`),
    },
  };
}

/** Publishes the saved draft. A failure after the write is uncertain because the item exists. */
async function publishSaved(
  fetchImplementation: typeof globalThis.fetch,
  options: EmDashDestinationOptions,
  content: EmDashContentResponse,
): Promise<
  | { readonly ok: true; readonly item: EmDashContentItem; readonly status: number }
  | { readonly ok: false; readonly result: DeliveryAttemptResult }
> {
  const id = content.item.id;
  if (!content._rev)
    return {
      ok: false,
      result: unknown(
        "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
        `EmDash saved remote item ${id} but returned no revision token; check that item before retrying.`,
      ),
    };
  let response: Response;
  try {
    response = await fetchImplementation(`${contentEndpoint(options.settings, id)}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiToken}`,
      },
      body: JSON.stringify({ _rev: content._rev }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (caught) {
    return {
      ok: false,
      result: unknown(
        "DESTINATION_REQUEST_OUTCOME_UNKNOWN",
        `EmDash saved remote item ${id}; publish outcome is unknown. ${caught instanceof Error ? caught.message : "The request failed."}`,
      ),
    };
  }
  const read = await readJsonBody(response);
  if (!read.ok) {
    return {
      ok: false,
      result: response.ok
        ? unknown(
            "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
            `EmDash saved remote item ${id}; publish answered ${response.status} with a body that is not JSON.`,
          )
        : unknown(
            "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
            `EmDash saved remote item ${id}; publish was not confirmed (${response.status}). Check the item before retrying.`,
          ),
    };
  }
  const published = readContentResponse(read.body, options.settings.collection);
  if (
    !response.ok ||
    !published ||
    published.item.id !== id ||
    published.item.status !== "published"
  )
    return {
      ok: false,
      result: unknown(
        "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
        `EmDash saved remote item ${id}; publish was not confirmed${responseMessage(read.body) ? `: ${responseMessage(read.body)}` : ` (HTTP ${response.status})`}. Check the item before retrying.`,
      ),
    };
  return { ok: true, item: published.item, status: response.status };
}

/** Delivers a Story to an EmDash collection using its public content REST API. */
export function createEmDashDestination(options: EmDashDestinationOptions): DeliveryDestination {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${options.apiToken}`,
  };

  return {
    name: EMDASH_DESTINATION_NAME,
    instanceId: siteDestinationInstanceId(options.settings),
    draft: options.settings.draft,

    async deliver(request: DeliveryRequest): Promise<DeliveryAttemptResult> {
      const creating = request.operation === "create";
      let saved: EmDashContentResponse;
      let savedStatus: number;

      if (creating) {
        let response: Response;
        try {
          response = await fetchImplementation(contentEndpoint(options.settings), {
            method: "POST",
            headers,
            body: JSON.stringify({
              data: {
                title: request.headline,
                excerpt: request.dek ?? "",
                content: emdashPortableText(request.blocks),
              },
              slug: request.slug,
              status: "draft",
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            redirect: "error",
          });
        } catch (caught) {
          return unknown(
            "DESTINATION_REQUEST_OUTCOME_UNKNOWN",
            caught instanceof Error ? caught.message : "The request failed.",
          );
        }
        const read = await readJsonBody(response);
        if (!read.ok)
          return response.ok
            ? unknown(
                "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
                `EmDash answered ${response.status} with a body that is not JSON.`,
              )
            : failed(response.status, null);
        if (!response.ok) return failed(response.status, responseMessage(read.body));
        const result = readContentResponse(read.body, options.settings.collection);
        if (!result || result.item.status !== "draft")
          return unknown(
            "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
            "EmDash accepted the create but returned no verifiable draft item identity.",
          );
        saved = result;
        savedStatus = response.status;
      } else {
        const id = request.remoteId;
        let get: Response;
        try {
          get = await fetchImplementation(contentEndpoint(options.settings, id), {
            method: "GET",
            headers: { Authorization: `Bearer ${options.apiToken}` },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            redirect: "error",
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
        const readCurrent = await readJsonBody(get);
        if (!readCurrent.ok)
          return get.ok
            ? {
                ok: false,
                failure: {
                  code: "DESTINATION_RESPONSE_INVALID",
                  message: "EmDash returned an unreadable item response before any write.",
                },
              }
            : failed(get.status, "EmDash returned an unreadable item response before any write.");
        if (!get.ok) return failed(get.status, responseMessage(readCurrent.body));
        const current = readContentResponse(readCurrent.body, options.settings.collection);
        if (!current || current.item.id !== id || !current._rev)
          return {
            ok: false,
            failure: {
              code: "DESTINATION_RESPONSE_INVALID",
              message:
                "EmDash returned an item without a verifiable identity and revision token; no write was attempted.",
            },
          };

        let update: Response;
        try {
          update = await fetchImplementation(contentEndpoint(options.settings, id), {
            method: "PUT",
            headers,
            body: JSON.stringify({
              data: {
                title: request.headline,
                excerpt: request.dek ?? "",
                content: emdashPortableText(request.blocks),
              },
              slug: request.slug,
              _rev: current._rev,
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            redirect: "error",
          });
        } catch (caught) {
          return unknown(
            "DESTINATION_REQUEST_OUTCOME_UNKNOWN",
            `EmDash update outcome for remote item ${id} is unknown. ${caught instanceof Error ? caught.message : "The request failed."}`,
          );
        }
        const updated = await readJsonBody(update);
        if (!updated.ok)
          return update.ok
            ? unknown(
                "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
                `EmDash may have updated remote item ${id}, but answered with a body that is not JSON.`,
              )
            : failed(
                update.status,
                `EmDash answered ${update.status} while updating remote item ${id}; check its revision before retrying.`,
              );
        if (!update.ok) return failed(update.status, responseMessage(updated.body));
        const result = readContentResponse(updated.body, options.settings.collection);
        if (!result || result.item.id !== id)
          return unknown(
            "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
            `EmDash accepted the update for remote item ${id} but returned no verifiable item.`,
          );
        saved = result;
        savedStatus = update.status;
      }

      if (options.settings.draft)
        return {
          ok: true,
          remoteId: saved.item.id,
          result: {
            status: savedStatus,
            message: bounded(
              request.operation === "update"
                ? `Saved draft changes to EmDash item ${saved.item.id}.`
                : `Saved ${saved.item.status} EmDash item ${saved.item.id}.`,
            ),
            ...(saved.item.slug && saved.item.slug !== request.slug
              ? { requestedSlug: request.slug, assignedSlug: saved.item.slug }
              : {}),
          },
        };

      const published = await publishSaved(fetchImplementation, options, saved);
      if (!published.ok) return published.result;
      return {
        ok: true,
        remoteId: published.item.id,
        result: {
          status: published.status,
          message: bounded(`Published EmDash item ${published.item.id}.`),
          ...(published.item.slug && published.item.slug !== request.slug
            ? { requestedSlug: request.slug, assignedSlug: published.item.slug }
            : {}),
        },
      };
    },
  };
}
