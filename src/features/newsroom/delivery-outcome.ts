import type { DeliveryFailureCode, StoryDelivery } from "@/domain/editorial";

/**
 * Where a Story stands with the outside world, read from its delivery record alone.
 *
 * The last delivery is the standing one: an earlier success does not survive a later refusal,
 * because what an operator needs to know is whether the post out there matches the Story in
 * here. The successful delivery is kept alongside it regardless, since that is the page a
 * further delivery would update rather than duplicate.
 */
export type DeliveryStanding =
  | { readonly kind: "never-delivered" }
  | { readonly kind: "in-flight"; readonly delivery: StoryDelivery }
  | { readonly kind: "delivered"; readonly delivery: StoryDelivery }
  | { readonly kind: "failed"; readonly delivery: StoryDelivery };

export interface DeliveryReading {
  readonly standing: DeliveryStanding;
  /** The most recent accepted delivery, which is the page any further delivery updates. */
  readonly delivered: StoryDelivery | null;
}

export function readDeliveries(deliveries: readonly StoryDelivery[]): DeliveryReading {
  const latest = deliveries.at(-1);
  const delivered = [...deliveries].reverse().find((one) => one.outcome === "succeeded") ?? null;
  if (!latest) return { standing: { kind: "never-delivered" }, delivered };
  if (latest.outcome === "running")
    return { standing: { kind: "in-flight", delivery: latest }, delivered };
  return {
    standing:
      latest.outcome === "succeeded"
        ? { kind: "delivered", delivery: latest }
        : { kind: "failed", delivery: latest },
    delivered,
  };
}

/**
 * Failure codes are the durable record and stay verbatim. Where one is reported as prose it also
 * has to say who can act on it: a destination that refused a credential is fixed in settings and
 * a destination that could not be reached is fixed by trying again, and an operator told only
 * that "delivery failed" cannot tell those two apart.
 */
const DELIVERY_FAILURE_EXPLANATIONS: Readonly<Record<DeliveryFailureCode, string>> = {
  DESTINATION_UNREACHABLE:
    "The destination did not answer. The Article is unchanged here; delivering again may succeed.",
  DESTINATION_REJECTED:
    "The destination understood the request and declined it. Nothing was published there.",
  DESTINATION_UNAUTHORIZED:
    "The destination refused the credential it was given. Check the destination credential in Settings, then deliver again.",
  DESTINATION_RESPONSE_INVALID:
    "The destination answered with something StoryRail could not read as an outcome. Check the destination before delivering again, because it may have made the post anyway.",
};

/**
 * The states that write no delivery record at all. Every one of them is a setting an operator
 * has yet to make, never something the destination did, and each explanation therefore names the
 * setting: an operator who reads a missing credential as a failed send goes looking at their
 * website for a post that was never sent.
 */
const DELIVERY_NOT_ATTEMPTED_EXPLANATIONS: Readonly<Record<string, string>> = {
  DESTINATION_NOT_CONFIGURED: "This Site has no destination configured. Add one in Settings.",
  CREDENTIAL_NOT_CONFIGURED: "No credential is stored for the destination. Enter one in Settings.",
  CREDENTIAL_KEY_UNAVAILABLE:
    "The stored credential cannot be read, because the encryption key it was written with is missing from this deployment.",
  CREDENTIAL_UNREADABLE:
    "The stored credential cannot be opened with the encryption key in use. Restore the key it was written with, or enter the credential again.",
};

export function deliveryFailureExplanation(code: string): string {
  return (
    DELIVERY_FAILURE_EXPLANATIONS[code as DeliveryFailureCode] ??
    "The destination did not accept the delivery."
  );
}

/**
 * Operator-facing one-liner: what happened, then the durable code for the audit trail. It says
 * the attempt was made, because a refusal has a delivery record behind it that a misconfiguration
 * does not.
 */
export function deliveryFailureMessage(failure: { readonly code: string }): string {
  return `Delivery was attempted and refused. ${deliveryFailureExplanation(failure.code)} (${failure.code})`;
}

/**
 * The message for an outcome that wrote nothing down. It opens by saying nothing was sent,
 * because that is the fact an operator is missing when they cannot tell a misconfiguration from
 * a failed send.
 */
export function deliveryNotAttemptedMessage(error: { readonly code: string }): string {
  const explanation =
    DELIVERY_NOT_ATTEMPTED_EXPLANATIONS[error.code] ?? "The newsroom could not attempt a delivery.";
  return `Nothing was sent. ${explanation} (${error.code})`;
}
