import type { UrlSource } from "./source-types";
import type { EditorialActor, SourceExtractionId, SourceId } from "./types";

export const SOURCE_EXTRACTION_FAILURE_CODES = [
  "RETRIEVAL_FAILED",
  "RETRIEVAL_TIMED_OUT",
  "RESPONSE_REJECTED",
  "UNSUPPORTED_CONTENT_TYPE",
  "CONTENT_TOO_LARGE",
  "EXTRACTION_FAILED",
] as const;

export type SourceExtractionFailureCode = (typeof SOURCE_EXTRACTION_FAILURE_CODES)[number];

export interface SourceExtractorDescriptor {
  readonly key: string;
  readonly version: string;
}

export interface ExtractedSourceDocument {
  readonly format: "markdown";
  readonly content: string;
  readonly title: string | null;
  readonly byline: string | null;
  readonly publishedAt: string | null;
  readonly language: string | null;
}

export interface SourceExtractionFailure {
  readonly code: SourceExtractionFailureCode;
  readonly retryable: boolean;
}

interface SourceExtractionRecordCommon {
  readonly id: SourceExtractionId;
  readonly sourceId: SourceId;
  readonly extractor: SourceExtractorDescriptor;
  readonly requestedBy: EditorialActor;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface SuccessfulSourceExtraction extends SourceExtractionRecordCommon {
  readonly outcome: "succeeded";
  readonly document: ExtractedSourceDocument;
}

export interface FailedSourceExtraction extends SourceExtractionRecordCommon {
  readonly outcome: "failed";
  readonly failure: SourceExtractionFailure;
}

export type SourceExtraction = SuccessfulSourceExtraction | FailedSourceExtraction;

interface RecordSourceExtractionCommandCommon {
  readonly extractionId: SourceExtractionId;
  readonly source: UrlSource;
  readonly extractor: SourceExtractorDescriptor;
  readonly requestedBy: EditorialActor;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface RecordSuccessfulSourceExtractionCommand extends RecordSourceExtractionCommandCommon {
  readonly outcome: "succeeded";
  readonly document: ExtractedSourceDocument;
}

export interface RecordFailedSourceExtractionCommand extends RecordSourceExtractionCommandCommon {
  readonly outcome: "failed";
  readonly failure: SourceExtractionFailure;
}

export type RecordSourceExtractionCommand =
  RecordSuccessfulSourceExtractionCommand | RecordFailedSourceExtractionCommand;

export type SourceExtractionValidationCode =
  | "SOURCE_EXTRACTOR_KEY_REQUIRED"
  | "SOURCE_EXTRACTOR_VERSION_REQUIRED"
  | "EXTRACTED_SOURCE_CONTENT_REQUIRED";

export interface SourceExtractionValidationError {
  readonly code: SourceExtractionValidationCode;
  readonly message: string;
}

export interface RecordSourceExtractionSuccess {
  readonly ok: true;
  readonly extraction: SourceExtraction;
}

export interface RecordSourceExtractionFailure {
  readonly ok: false;
  readonly error: SourceExtractionValidationError;
}

export type RecordSourceExtractionResult =
  RecordSourceExtractionSuccess | RecordSourceExtractionFailure;
