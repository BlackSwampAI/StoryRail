"use client";

import { useState } from "react";

import type { InterruptedWorkClient, InterruptedWorkRecovery } from "./interrupted-work-client";
import styles from "./newsroom-shell.module.css";

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Closes out work whose process disappeared, when an operator asks for it.
 *
 * It is a button rather than a timer on purpose: when recovery runs is an operational decision,
 * and a deployment that wants it scheduled calls the same endpoint on its own clock. Recovery
 * only closes what is stuck. It never resumes a run and never sends a delivery again, so what it
 * reports is what it settled, and what is left to do is left to the operator.
 */
export function InterruptedWorkRecovery({
  requests,
}: Readonly<{ readonly requests: InterruptedWorkClient }>) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<InterruptedWorkRecovery | null>(null);

  async function recover() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    setRecovery(null);
    try {
      const result = await requests.recover();
      if (result.kind !== "completed") {
        setMessage(result.message);
        return;
      }
      setRecovery(result.recovery);
    } catch {
      setMessage("Interrupted work could not be recovered. Nothing is known to have changed.");
    } finally {
      setPending(false);
    }
  }

  const closed =
    recovery === null
      ? 0
      : recovery.policyRuns + recovery.agentRuns + recovery.toolCalls + recovery.deliveries.length;

  return (
    <div className={styles.recoveryPanel} aria-busy={pending}>
      <div>
        <button
          type="button"
          className={styles.primaryAction}
          disabled={pending}
          onClick={() => void recover()}
        >
          {pending ? "Recovering…" : "Recover interrupted work"}
        </button>
      </div>

      {message === null ? null : <p role="alert">{message}</p>}

      {recovery === null ? null : (
        <div role="status">
          {closed === 0 ? (
            <p>Nothing was stuck. No work has been waiting on a process that stopped.</p>
          ) : (
            <>
              <p>
                Closed {plural(recovery.policyRuns, "automation", "automations")},{" "}
                {plural(recovery.agentRuns, "agent run", "agent runs")},{" "}
                {plural(recovery.toolCalls, "tool call", "tool calls")} and{" "}
                {plural(recovery.deliveries.length, "delivery", "deliveries")}. Nothing was resumed
                or sent again.
              </p>
              {recovery.deliveries.length === 0 ? null : (
                <>
                  <p>
                    These deliveries may or may not have reached their destination. Each is now
                    marked unknown, and the Story cannot be delivered again until an operator
                    confirms what happened. Open the Story and deliver it to review.
                  </p>
                  <ul>
                    {recovery.deliveries.map((delivery) => (
                      <li key={delivery.id}>
                        {delivery.operation === "create" ? "Create" : "Update"} of{" "}
                        <code>{delivery.slug}</code> to {delivery.destination}, Story{" "}
                        <code>{delivery.storyId}</code>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
