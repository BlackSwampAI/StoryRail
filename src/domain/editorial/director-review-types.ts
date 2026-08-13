export const DIRECTOR_RECOMMENDATIONS = ["approve", "request_changes"] as const;
export type DirectorRecommendation = (typeof DIRECTOR_RECOMMENDATIONS)[number];

export const DIRECTOR_CHECK_STATUSES = ["pass", "needs_changes"] as const;
export type DirectorCheckStatus = (typeof DIRECTOR_CHECK_STATUSES)[number];

export const DIRECTOR_CHECK_NAMES = [
  "assignment",
  "accuracy",
  "headline",
  "structure",
  "style",
] as const;
export type DirectorCheckName = (typeof DIRECTOR_CHECK_NAMES)[number];

export interface DirectorReviewCheck {
  readonly status: DirectorCheckStatus;
  readonly note: string;
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
