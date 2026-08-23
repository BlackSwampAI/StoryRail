import {
  MAXIMUM_STANDARDS_CHARACTERS,
  type NewsroomStandards,
  type NewsroomStandardsValidationCode,
  type RecordNewsroomStandardsResult,
} from "./newsroom-standards-types";

function invalid(
  code: NewsroomStandardsValidationCode,
  message: string,
): RecordNewsroomStandardsResult {
  return { ok: false, error: { code, message } };
}

export function recordNewsroomStandards(
  candidate: NewsroomStandards,
): RecordNewsroomStandardsResult {
  if (
    typeof candidate.id !== "string" ||
    candidate.id.trim().length === 0 ||
    typeof candidate.updatedAt !== "string" ||
    candidate.updatedAt.trim().length === 0 ||
    candidate.updatedBy?.type !== "operator" ||
    typeof candidate.updatedBy.operatorId !== "string" ||
    candidate.updatedBy.operatorId.trim().length === 0
  )
    return invalid(
      "NEWSROOM_STANDARDS_IDENTITY_INVALID",
      "Standards record their identity, when they were written, and who wrote them.",
    );

  if (!Number.isInteger(candidate.revisionNumber) || candidate.revisionNumber < 1)
    return invalid(
      "NEWSROOM_STANDARDS_REVISION_INVALID",
      "Standards revisions are numbered from 1.",
    );

  const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
  if (text.length === 0 || text.length > MAXIMUM_STANDARDS_CHARACTERS)
    return invalid(
      "NEWSROOM_STANDARDS_TEXT_INVALID",
      `Standards must say something, within ${MAXIMUM_STANDARDS_CHARACTERS} characters.`,
    );

  return { ok: true, standards: structuredClone({ ...candidate, text }) };
}

/**
 * Adds a newsroom's standards to a role's system prompt.
 *
 * They are placed after the role's own rules and labelled as what they are, because they govern
 * how work reads rather than what may be claimed. Whatever they say, nothing about evidence,
 * citation, or tool use bends: those are checked in code after the model has answered, so a
 * house style cannot talk its way past them even if it tried.
 */
export function withNewsroomStandards(systemPrompt: string, standards: string | null): string {
  const text = standards?.trim() ?? "";
  if (text.length === 0) return systemPrompt;
  return `${systemPrompt}

Editorial standards for this newsroom, set by the operator. They govern voice, usage, and presentation. They never relax the rules above about evidence, citation, tools, or what you may claim:
${text}`;
}

/** The standards in force when something started, from an append-ordered history. */
export function standardsInForceAt(
  history: readonly NewsroomStandards[],
  at: string,
): NewsroomStandards | null {
  const moment = Date.parse(at);
  const applicable = history.filter((standards) => {
    const written = Date.parse(standards.updatedAt);
    return Number.isNaN(moment) || Number.isNaN(written) ? false : written <= moment;
  });
  return applicable.at(-1) ?? null;
}
