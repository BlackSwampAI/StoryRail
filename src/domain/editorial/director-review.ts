import {
  DIRECTOR_CHECK_NAMES,
  type DirectorReviewRecommendation,
  type DirectorReviewValidationResult,
} from "./director-review-types";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function createDirectorReview(
  candidate: DirectorReviewRecommendation,
): DirectorReviewValidationResult {
  if (!nonEmpty(candidate.summary)) {
    return {
      ok: false,
      error: { code: "DIRECTOR_REVIEW_INVALID", message: "The review summary is required." },
    };
  }
  if (
    !DIRECTOR_CHECK_NAMES.every((name) => {
      const check = candidate.checks[name];
      return (check.status === "pass" || check.status === "needs_changes") && nonEmpty(check.note);
    })
  ) {
    return {
      ok: false,
      error: {
        code: "DIRECTOR_REVIEW_INVALID",
        message: "Every Director check requires a supported status and non-empty note.",
      },
    };
  }
  const needsChanges = DIRECTOR_CHECK_NAMES.some(
    (name) => candidate.checks[name].status === "needs_changes",
  );
  if (
    candidate.recommendation === "approve" &&
    (needsChanges || candidate.revisionInstructions !== null)
  ) {
    return {
      ok: false,
      error: {
        code: "DIRECTOR_REVIEW_INVALID",
        message: "An approval requires passing checks and no revision instructions.",
      },
    };
  }
  if (
    candidate.recommendation === "request_changes" &&
    (!needsChanges || !nonEmpty(candidate.revisionInstructions))
  ) {
    return {
      ok: false,
      error: {
        code: "DIRECTOR_REVIEW_INVALID",
        message: "A change request requires a failed check and actionable instructions.",
      },
    };
  }
  if (candidate.recommendation !== "approve" && candidate.recommendation !== "request_changes") {
    return {
      ok: false,
      error: { code: "DIRECTOR_REVIEW_INVALID", message: "The recommendation is unsupported." },
    };
  }
  return {
    ok: true,
    review: structuredClone({
      ...candidate,
      summary: candidate.summary.trim(),
      checks: Object.fromEntries(
        DIRECTOR_CHECK_NAMES.map((name) => [
          name,
          { ...candidate.checks[name], note: candidate.checks[name].note.trim() },
        ]),
      ) as DirectorReviewRecommendation["checks"],
      revisionInstructions: candidate.revisionInstructions?.trim() ?? null,
    }),
  };
}
