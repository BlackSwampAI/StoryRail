import {
  DELIVERY_FAILURE_CODES,
  MAXIMUM_DELIVERY_RECORD_CHARACTERS,
  type RecordStoryDeliveryResult,
  type StoryDelivery,
  type StoryDeliveryValidationCode,
} from "./story-delivery-types";

const SLUG_SEPARATOR = "-";

/** Long enough for any headline a reader would recognise, short enough for every path limit. */
export const MAXIMUM_DELIVERY_SLUG_LENGTH = 96;

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

function invalid(code: StoryDeliveryValidationCode, message: string): RecordStoryDeliveryResult {
  return { ok: false, error: { code, message } };
}

/**
 * The address a headline is delivered to, derived rather than stored so that the same headline
 * always names the same page.
 *
 * Nothing is appended to make a collision go away. A slug that is already taken surfaces as a
 * refusal an operator can see and decide about; silently publishing to an address nobody chose
 * is the worse of the two outcomes, because it looks like it worked.
 */
export function storyDeliverySlug(headline: string): string {
  return (
    (typeof headline === "string" ? headline : "")
      .normalize("NFKD")
      // Combining marks are dropped rather than transliterated: an accented character becomes its
      // base letter, which is what a reader would type, instead of disappearing entirely.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, SLUG_SEPARATOR)
      .replace(/^-+|-+$/g, "")
      .slice(0, MAXIMUM_DELIVERY_SLUG_LENGTH)
      .replace(/-+$/g, "")
  );
}

function measured(value: unknown): number | null {
  try {
    return JSON.stringify(value ?? null)?.length ?? null;
  } catch {
    // A value that cannot be serialised cannot be recorded, whatever its size.
    return null;
  }
}

/**
 * A delivery is a durable fact about what StoryRail put outside itself, valid whether or not the
 * destination accepted it. A run that quietly retried a rejection would otherwise leave the same
 * trail as one that was accepted the first time.
 */
export function recordStoryDelivery(candidate: StoryDelivery): RecordStoryDeliveryResult {
  if (
    !nonEmpty(candidate?.id) ||
    !nonEmpty(candidate.storyId) ||
    !nonEmpty(candidate.revisionId) ||
    !nonEmpty(candidate.destination) ||
    (candidate.remoteId !== null && !nonEmpty(candidate.remoteId)) ||
    !nonEmpty(candidate.startedAt) ||
    (candidate.outcome === "running"
      ? candidate.completedAt !== null
      : !nonEmpty(candidate.completedAt))
  )
    return invalid(
      "STORY_DELIVERY_IDENTITY_INVALID",
      "Delivery identities and timestamps must be non-empty.",
    );

  const request = candidate.request;
  if (
    typeof request !== "object" ||
    request === null ||
    (request.operation !== "create" && request.operation !== "update") ||
    !nonEmpty(request.slug) ||
    typeof request.draft !== "boolean" ||
    !Number.isInteger(request.bodyCharacters) ||
    request.bodyCharacters < 0
  )
    return invalid(
      "STORY_DELIVERY_REQUEST_INVALID",
      "A delivery says whether it created or updated a page, at which slug, and how large it was.",
    );

  const requestSize = measured(request);
  if (requestSize === null || requestSize > MAXIMUM_DELIVERY_RECORD_CHARACTERS)
    return invalid(
      "STORY_DELIVERY_RECORD_TOO_LARGE",
      "A delivery request must be recordable within the audit record's size.",
    );

  if (candidate.outcome === "running") return { ok: true, delivery: structuredClone(candidate) };

  if (candidate.outcome === "succeeded") {
    const { result } = candidate;
    // An accepted delivery that cannot say which page it wrote is not a success worth recording:
    // the next Revision would make a second page rather than updating the first.
    if (!nonEmpty(candidate.remoteId))
      return invalid(
        "STORY_DELIVERY_IDENTITY_INVALID",
        "An accepted delivery names the page the destination made.",
      );
    if (
      typeof result !== "object" ||
      result === null ||
      !Number.isInteger(result.status) ||
      (result.message !== null && !nonEmpty(result.message))
    )
      return invalid(
        "STORY_DELIVERY_OUTCOME_INVALID",
        "A succeeded delivery records the status and whatever the destination said.",
      );
    const resultSize = measured(result);
    if (resultSize === null || resultSize > MAXIMUM_DELIVERY_RECORD_CHARACTERS)
      return invalid(
        "STORY_DELIVERY_RECORD_TOO_LARGE",
        "A delivery result is an audit record, not a copy of what was delivered.",
      );
    return { ok: true, delivery: structuredClone(candidate) };
  }

  if (
    candidate.outcome !== "failed" ||
    !(DELIVERY_FAILURE_CODES as readonly string[]).includes(candidate.failure?.code) ||
    (candidate.failure.message !== null && !nonEmpty(candidate.failure.message))
  )
    return invalid("STORY_DELIVERY_OUTCOME_INVALID", "Failed delivery outcome is invalid.");

  return { ok: true, delivery: structuredClone(candidate) };
}
