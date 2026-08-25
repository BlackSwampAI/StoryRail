import type { DeliveryFailureCode } from "@/domain/editorial";

/**
 * What the destination said, kept short. The record is an audit fact about the exchange, not a
 * place to keep a page of HTML an error handler happened to return.
 */
export const MAXIMUM_DESTINATION_MESSAGE_CHARACTERS = 500;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function bounded(message: string): string | null {
  const trimmed = message.trim().slice(0, MAXIMUM_DESTINATION_MESSAGE_CHARACTERS).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A refusal and an inability to answer are different facts for an operator: the first is fixed by
 * changing what was sent, the second by waiting or by fixing the far end.
 *
 * A `500` is a rejection, not an absence. This was learned from a live run: a destination answered
 * `500` and the delivery was recorded as "unreachable" for a server that plainly answered, which
 * sent the operator looking at the network instead of at the request. A timeout and a rate-limit
 * deferral are the two statuses that genuinely mean "come back later", so they alone stay
 * unreachable alongside a request that got no response at all.
 */
export function failureCodeFor(status: number): DeliveryFailureCode {
  if (status === 401 || status === 403) return "DESTINATION_UNAUTHORIZED";
  if (status === 408 || status === 429) return "DESTINATION_UNREACHABLE";
  return "DESTINATION_REJECTED";
}

export type DestinationResponseBody =
  { readonly ok: true; readonly body: unknown } | { readonly ok: false };

/**
 * Reads the body once, as text, and then as JSON. Reading it twice is not possible, and a body
 * that is not JSON is an outcome nothing can vouch for rather than an empty one.
 */
export async function readJsonBody(response: Response): Promise<DestinationResponseBody> {
  try {
    const text = await response.text();
    return { ok: true, body: text.trim().length > 0 ? JSON.parse(text) : null };
  } catch {
    return { ok: false };
  }
}
