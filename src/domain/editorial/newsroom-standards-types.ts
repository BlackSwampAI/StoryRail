import type { NewsroomStandardsId, OperatorActor } from "./types";

/**
 * How long a newsroom's standards may be. Long enough for a real style guide, short enough that
 * it cannot crowd out the evidence an agent is supposed to be reading.
 */
export const MAXIMUM_STANDARDS_CHARACTERS = 8_000;
export const MAXIMUM_PUBLICATION_BRIEF_FIELD_CHARACTERS = 2_000;

/** Structured publication direction, kept with the revisioned house standards. */
export interface PublicationBrief {
  readonly audience: string;
  readonly readerBenefit: string;
  readonly coverageCriteria: string;
  readonly voice: string;
  readonly avoid: string;
}

/**
 * The editorial standards every agent in a newsroom works under: voice, usage, what this
 * publication does and does not do.
 *
 * Revisions are append-only and timestamped. New runs capture the selected revision in their
 * input so later edits cannot change the context recorded for earlier work.
 */
export interface NewsroomStandards {
  readonly id: NewsroomStandardsId;
  readonly revisionNumber: number;
  readonly text: string;
  readonly brief?: PublicationBrief;
  readonly updatedBy: OperatorActor;
  readonly updatedAt: string;
}

export type NewsroomStandardsValidationCode =
  | "NEWSROOM_STANDARDS_IDENTITY_INVALID"
  | "NEWSROOM_STANDARDS_REVISION_INVALID"
  | "NEWSROOM_STANDARDS_TEXT_INVALID"
  | "NEWSROOM_STANDARDS_BRIEF_INVALID";

export type RecordNewsroomStandardsResult =
  | { readonly ok: true; readonly standards: NewsroomStandards }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: NewsroomStandardsValidationCode;
        readonly message: string;
      };
    };

/**
 * Who a newsroom is, as an agent is told it: the Site's own name and what it publishes.
 *
 * Deliberately separate from {@link NewsroomStandards}. Standards govern how work reads; this
 * says who the newsroom is and who it serves, which is what an agent needs in order to judge
 * whether a story belongs here at all.
 */
export interface NewsroomIdentity {
  readonly name: string;
  readonly description: string;
}
