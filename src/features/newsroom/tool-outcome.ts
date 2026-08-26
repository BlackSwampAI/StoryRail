import type { AgentToolCall, JsonValue, ToolFailureCode } from "@/domain/editorial";

import { withFailureCode } from "./failure-prose";

/**
 * Tool names are registered by whoever adds the tool, so this maps the ones the newsroom ships
 * and falls back to the recorded name. An unrecognised tool still has to appear — a call the
 * screen cannot label is still a call the run spent and a place it reached.
 */
const TOOL_LABELS: Readonly<Record<string, string>> = {
  fetch_url: "Retrieved a page",
  web_search: "Searched the web",
  search_archive: "Searched the archive",
};

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}

/**
 * Failure codes are the durable record and stay verbatim. Where one is shown as prose it has to
 * say whose refusal it was: a site that declined to be read is nothing the operator can fix, and
 * a run that ran out of calls is a budget decision rather than a fault. Told only that a tool
 * "failed", an operator reads a Story with one Source as a broken newsroom.
 */
const TOOL_FAILURE_EXPLANATIONS: Readonly<Record<ToolFailureCode, string>> = {
  TOOL_RUN_ABANDONED:
    "The process running this stopped while the tool was working, so nothing came back from it.",
  TOOL_NOT_AVAILABLE: "The agent asked for a tool this run was not given.",
  TOOL_REQUEST_INVALID: "The agent asked for this tool with arguments it does not accept.",
  TOOL_TARGET_REFUSED:
    "The target refused to be read. That is the site's decision, not a fault here; another Source has to carry this.",
  TOOL_EXECUTION_FAILED:
    "The tool ran and the work behind it failed. Running it again may succeed.",
  TOOL_BUDGET_EXHAUSTED: "The run had already spent every tool call it was allowed.",
};

export function toolFailureExplanation(code: ToolFailureCode): string {
  return TOOL_FAILURE_EXPLANATIONS[code];
}

/** Operator-facing one-liner: what happened, then the durable code for the audit trail. */
export function toolFailureMessage(failure: {
  readonly code: ToolFailureCode;
  readonly message: string | null;
}): string {
  // The tool's own message names the particular target or reason and the code names the kind, so
  // both are kept: a refusal that says which host declined is the answer an operator wanted.
  const explanation = failure.message
    ? `${toolFailureExplanation(failure.code)} ${failure.message}`
    : toolFailureExplanation(failure.code);
  return withFailureCode(explanation, failure.code);
}

/** How much of an argument is worth showing before it stops being readable at a glance. */
const ARGUMENT_CHARACTERS = 96;

function readableArgument(value: JsonValue): string | null {
  if (typeof value === "string") return value.trim().length > 0 ? value.trim() : null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/**
 * What the call was for, in one line. A URL is shown without its scheme and a query verbatim,
 * because "theverge.com/…/mac-studio" is what an operator recognises; the whole request stays in
 * the audit record, which is where the exact arguments belong.
 */
export function toolArgumentSummary(request: AgentToolCall["request"]): string | null {
  const preferred = ["url", "query"];
  const keys = [...preferred, ...Object.keys(request).filter((key) => !preferred.includes(key))];
  for (const key of keys) {
    const value = request[key];
    if (value === undefined) continue;
    const readable = readableArgument(value);
    if (readable === null) continue;
    const trimmed = readable.replace(/^https?:\/\//, "");
    return trimmed.length > ARGUMENT_CHARACTERS
      ? `${trimmed.slice(0, ARGUMENT_CHARACTERS - 1)}…`
      : trimmed;
  }
  return null;
}

/** Outcome as a word rather than a status code, since the list is read at a glance. */
export function toolOutcomeLabel(call: AgentToolCall): string {
  if (call.outcome === "running") return "Working…";
  return call.outcome === "succeeded" ? "Succeeded" : "Failed";
}
