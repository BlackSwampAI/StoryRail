import {
  MAXIMUM_STANDARDS_CHARACTERS,
  type NewsroomIdentity,
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
 * Adds a newsroom's own context to a role's system prompt: who the newsroom is, and the
 * standards it works to.
 *
 * Both sit after the role's own rules and are labelled as what they are. Standards govern how
 * work reads rather than what may be claimed; the Site's identity says who this publication is
 * and who it serves, so an agent can judge whether a story belongs here. Neither bends anything
 * about evidence, citation, or tool use — those are checked in code after the model has
 * answered, so no amount of context can talk its way past them even if it tried.
 *
 * A newsroom that has said nothing about itself gets no heading at all, rather than an empty
 * one that reads as though the operator left the field blank on purpose.
 */
export function withNewsroomStandards(
  systemPrompt: string,
  standards: string | null,
  identity: NewsroomIdentity | null = null,
): string {
  const description = identity?.description?.trim() ?? "";
  const name = identity?.name?.trim() ?? "";
  const composed =
    description.length === 0
      ? systemPrompt
      : `${systemPrompt}

The newsroom you are working for${name.length === 0 ? "" : `, ${name}`}, publishes: ${description}
Treat that as context for judgement about what belongs here and who it is for. It is never licence to assert anything the evidence does not support, and it never relaxes the rules above about evidence, citation, tools, or what you may claim.`;

  const text = standards?.trim() ?? "";
  if (text.length === 0) return composed;
  return `${composed}

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
