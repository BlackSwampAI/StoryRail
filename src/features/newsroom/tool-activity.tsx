"use client";

import type { AgentRun, AgentToolCall } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import { readableTime } from "./readable-time";
import {
  toolArgumentSummary,
  toolFailureMessage,
  toolLabel,
  toolOutcomeLabel,
} from "./tool-outcome";

/** Which role a call belongs to, so a list spanning several runs still says who reached out. */
function roleOfRun(runs: readonly AgentRun[], runId: string): string | null {
  const run = runs.find(({ id }) => id === runId);
  if (!run) return null;
  const labels: Readonly<Record<AgentRun["role"], string>> = {
    researcher: "Researcher",
    writer: "Writer",
    editor_in_chief: "Director",
    assignment_editor: "Assignment Editor",
  };
  return labels[run.role];
}

/**
 * What the newsroom actually did, while it is doing it.
 *
 * Every one of these calls was recorded before it left the process, and until now none of it
 * reached the screen: a run that spent five of six calls and had one fetch refused looked
 * exactly like a run that found one Source and stopped. The operator cannot read the server's
 * logs, so this panel is their whole account of the work.
 */
export function ToolActivity({
  calls,
  runs,
  budget,
}: Readonly<{
  calls: readonly AgentToolCall[];
  runs: readonly AgentRun[];
  /** The calls a research run is allowed, stated so what was spent can be read against it. */
  budget: number;
}>) {
  if (calls.length === 0) return null;
  const researchRunIds = new Set(
    runs.filter((run) => run.role === "researcher").map((run) => run.id),
  );
  const researchCalls = calls.filter((call) => researchRunIds.has(call.runId));
  const refusedCount = calls.filter((call) => call.outcome === "failed").length;
  return (
    <section className={styles.toolActivity} aria-labelledby="tool-activity-heading">
      <p className={styles.currentTaskLabel}>Run activity</p>
      <h3 id="tool-activity-heading">What the newsroom reached for</h3>
      {researchCalls.length > 0 ? (
        <p className={styles.toolActivityBudget}>
          {researchCalls.length} of {budget} research calls used
          {refusedCount > 0
            ? `, ${refusedCount} ${refusedCount === 1 ? "call was" : "calls were"} refused`
            : ""}
          .
        </p>
      ) : null}
      <ol className={styles.toolCallList}>
        {calls.map((call) => {
          const argument = toolArgumentSummary(call.request);
          const role = roleOfRun(runs, call.runId);
          return (
            <li key={call.id} className={styles.toolCall} data-outcome={call.outcome}>
              <p className={styles.toolCallHeadline}>
                <span className={styles.toolCallTool}>{toolLabel(call.tool)}</span>
                {argument ? <span className={styles.toolCallArgument}>{argument}</span> : null}
                <span className={styles.toolCallOutcome}>{toolOutcomeLabel(call)}</span>
              </p>
              {call.outcome === "failed" ? (
                <p className={styles.toolCallFailure}>{toolFailureMessage(call.failure)}</p>
              ) : null}
              <p className={styles.toolCallMeta}>
                {role ? `${role} · ` : ""}
                {call.tool} · {readableTime(call.requestedAt)}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
