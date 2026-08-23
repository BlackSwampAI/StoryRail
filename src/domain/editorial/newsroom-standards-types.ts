import type { NewsroomStandardsId, OperatorActor } from "./types";

/**
 * How long a newsroom's standards may be. Long enough for a real style guide, short enough that
 * it cannot crowd out the evidence an agent is supposed to be reading.
 */
export const MAXIMUM_STANDARDS_CHARACTERS = 8_000;

/**
 * The editorial standards every agent in a newsroom works under: voice, usage, what this
 * publication does and does not do.
 *
 * Revisions are append-only and timestamped, so the standards a run worked under can be read
 * back from when it started rather than being copied onto every run.
 */
export interface NewsroomStandards {
  readonly id: NewsroomStandardsId;
  readonly revisionNumber: number;
  readonly text: string;
  readonly updatedBy: OperatorActor;
  readonly updatedAt: string;
}

export type NewsroomStandardsValidationCode =
  | "NEWSROOM_STANDARDS_IDENTITY_INVALID"
  | "NEWSROOM_STANDARDS_REVISION_INVALID"
  | "NEWSROOM_STANDARDS_TEXT_INVALID";

export type RecordNewsroomStandardsResult =
  | { readonly ok: true; readonly standards: NewsroomStandards }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: NewsroomStandardsValidationCode;
        readonly message: string;
      };
    };
