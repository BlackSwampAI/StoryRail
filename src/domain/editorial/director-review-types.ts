export const DIRECTOR_RECOMMENDATIONS = ["approve", "request_changes"] as const;
export type DirectorRecommendation = (typeof DIRECTOR_RECOMMENDATIONS)[number];

export const DIRECTOR_CHECK_STATUSES = ["pass", "needs_changes"] as const;
export type DirectorCheckStatus = (typeof DIRECTOR_CHECK_STATUSES)[number];

export const DIRECTOR_CHECK_NAMES = [
  "assignment",
  // Mechanical verification proves a cited passage exists. It cannot say whether the claim built
  // on that passage is a fair reading of it, which is the judgement a Director is actually for.
  "support",
  "accuracy",
  "headline",
  "structure",
  "style",
] as const;
export type DirectorCheckName = (typeof DIRECTOR_CHECK_NAMES)[number];

export interface DirectorReviewCheck {
  readonly status: DirectorCheckStatus;
  readonly note: string;
  /**
   * The passage of the Article this check is judging, copied verbatim and verified against the
   * Article before the review is recorded. A reviewer that must point at something cannot
   * return "well structured and accurate" about work it did not read.
   */
  readonly quoted: string;
}

export interface DirectorReviewRecommendation {
  readonly recommendation: DirectorRecommendation;
  readonly summary: string;
  readonly checks: Readonly<Record<DirectorCheckName, DirectorReviewCheck>>;
  readonly revisionInstructions: string | null;
}

export type DirectorReviewValidationResult =
  | { readonly ok: true; readonly review: DirectorReviewRecommendation }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "DIRECTOR_REVIEW_INVALID";
        readonly message: string;
      };
    };
