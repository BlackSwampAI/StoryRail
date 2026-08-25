import type {
  EditorialActor,
  SourceEvidencePreparationId,
  SourceExtractionId,
  SourceId,
} from "./types";

export const MODEL_FAILURE_CODES = [
  "MODEL_AUTHENTICATION_FAILED",
  // The account reached a billing or quota limit. Distinct from an authentication failure —
  // the credential is valid — and from a rejected response, because the operator owns the fix.
  "MODEL_QUOTA_EXHAUSTED",
  "MODEL_REQUEST_TIMED_OUT",
  "MODEL_REQUEST_FAILED",
  "MODEL_RESPONSE_REJECTED",
  "MODEL_OUTPUT_INVALID",
  // The response was well formed but cited evidence that does not support it. Distinct from an
  // invalid shape: the model answered correctly and the answer was not grounded.
  "MODEL_OUTPUT_UNGROUNDED",
  // The process driving the run disappeared before the model answered. Not a provider problem,
  // and naming it as one would send the operator looking in the wrong place.
  "MODEL_RUN_ABANDONED",
  // A correction turn rewrote work nobody objected to. The draft is refused for its original
  // citations; naming this separately says the correction was the reason it could not be taken.
  "MODEL_CORRECTION_OUT_OF_SCOPE",
] as const;

export type ModelFailureCode = (typeof MODEL_FAILURE_CODES)[number];

/**
 * The failures that refuse work for the evidence behind it, and so are the only ones a set of
 * grounding findings may be attached to. Both are grounding refusals: one is a draft whose
 * citations did not hold, the other a draft whose citations did not hold and whose single
 * correction turn rewrote work nobody had objected to.
 *
 * It lives beside the codes themselves because it is read in three places — the domain that
 * records a run, the database that stores it, and the browser that reads it back. Written out
 * separately in each, the three drifted: the domain and the database were widened together and
 * the browser was not, so a run the system had recorded correctly could not be loaded.
 */
export const GROUNDING_REFUSAL_CODES = [
  "MODEL_OUTPUT_UNGROUNDED",
  "MODEL_CORRECTION_OUT_OF_SCOPE",
] as const satisfies readonly ModelFailureCode[];
export const PREPARATION_FAILURE_CODES = MODEL_FAILURE_CODES;
export type PreparationFailureCode = ModelFailureCode;

export interface ModelDescriptor {
  readonly provider: string;
  readonly model: string;
}

export interface EvidencePreparerDescriptor {
  readonly key: string;
  readonly version: string;
}

export interface PreparedSourceDocument {
  readonly format: "markdown";
  readonly content: string;
  readonly title: string | null;
  readonly byline: string | null;
  readonly publishedAt: string | null;
  readonly language: string | null;
}

/**
 * What the model was actually shown. Raw evidence may exceed the preparation input budget, in
 * which case only a prefix is submitted; recording both lengths keeps the attempt honest about
 * how much of the immutable raw extraction it could see.
 */
export interface PreparationInputMeasurement {
  readonly rawCharacters: number;
  readonly submittedCharacters: number;
}

interface SourceEvidencePreparationCommon {
  readonly id: SourceEvidencePreparationId;
  readonly sourceId: SourceId;
  readonly extractionId: SourceExtractionId;
  readonly model: ModelDescriptor;
  readonly preparer: EvidencePreparerDescriptor;
  readonly requestedBy: EditorialActor;
  readonly input: PreparationInputMeasurement;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface SuccessfulSourceEvidencePreparation extends SourceEvidencePreparationCommon {
  readonly outcome: "succeeded";
  readonly document: PreparedSourceDocument;
}

export interface FailedSourceEvidencePreparation extends SourceEvidencePreparationCommon {
  readonly outcome: "failed";
  readonly failure: {
    readonly code: PreparationFailureCode;
    readonly retryable: boolean;
  };
}

export type SourceEvidencePreparation =
  SuccessfulSourceEvidencePreparation | FailedSourceEvidencePreparation;

interface RecordPreparationCommandCommon {
  readonly preparationId: SourceEvidencePreparationId;
  readonly sourceId: SourceId;
  readonly extractionId: SourceExtractionId;
  readonly model: ModelDescriptor;
  readonly preparer: EvidencePreparerDescriptor;
  readonly requestedBy: EditorialActor;
  readonly input: PreparationInputMeasurement;
  readonly startedAt: string;
  readonly completedAt: string;
}

export type RecordSourceEvidencePreparationCommand =
  | (RecordPreparationCommandCommon & {
      readonly outcome: "succeeded";
      readonly document: PreparedSourceDocument;
    })
  | (RecordPreparationCommandCommon & {
      readonly outcome: "failed";
      readonly failure: FailedSourceEvidencePreparation["failure"];
    });

export type SourceEvidencePreparationValidationCode =
  | "PREPARATION_PROVIDER_REQUIRED"
  | "PREPARATION_MODEL_REQUIRED"
  | "PREPARER_KEY_REQUIRED"
  | "PREPARER_VERSION_REQUIRED"
  | "PREPARATION_INPUT_MEASUREMENT_INVALID"
  | "PREPARED_SOURCE_CONTENT_REQUIRED";

export type RecordSourceEvidencePreparationResult =
  | { readonly ok: true; readonly preparation: SourceEvidencePreparation }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: SourceEvidencePreparationValidationCode;
        readonly message: string;
      };
    };
