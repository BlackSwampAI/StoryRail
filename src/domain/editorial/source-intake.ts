import type { IntakeUrlSourceCommand, IntakeUrlSourceResult, UrlSource } from "./source-types";
import { canonicalizeSourceUrl } from "./source-url";

export function intakeUrlSource(
  command: IntakeUrlSourceCommand,
  existingSources: readonly UrlSource[],
): IntakeUrlSourceResult {
  const canonicalization = canonicalizeSourceUrl(command.submittedUrl);

  if (!canonicalization.ok) {
    return canonicalization;
  }

  const existingSource = existingSources.find(
    (source) => source.canonicalUrl === canonicalization.canonicalUrl,
  );

  if (existingSource) {
    return {
      ok: false,
      error: {
        code: "DUPLICATE_SOURCE",
        message: "A Source with the same canonical URL already exists.",
        existingSourceId: existingSource.id,
        canonicalUrl: canonicalization.canonicalUrl,
      },
    };
  }

  return {
    ok: true,
    source: {
      id: command.sourceId,
      type: "url",
      submittedUrl: command.submittedUrl,
      canonicalUrl: canonicalization.canonicalUrl,
      submittedBy: command.submittedBy,
      receivedAt: command.receivedAt,
    },
  };
}
