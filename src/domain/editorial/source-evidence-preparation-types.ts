import type {
  EditorialActor,
  SourceEvidencePreparationId,
  SourceExtractionId,
  SourceId,
} from "./types";

export const MODEL_FAILURE_CODES = [
  "MODEL_AUTHENTICATION_FAILED",
  "MODEL_REQUEST_TIMED_OUT",
  "MODEL_REQUEST_FAILED",
  "MODEL_RESPONSE_REJECTED",
  "MODEL_OUTPUT_INVALID",
] as const;

export type ModelFailureCode = (typeof MODEL_FAILURE_CODES)[number];
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
