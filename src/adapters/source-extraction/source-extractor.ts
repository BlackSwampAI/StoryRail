import type {
  CredentialUnavailableError,
  ExtractedSourceDocument,
  SourceExtractionFailure,
  SourceExtractorDescriptor,
  UrlSource,
} from "@/domain/editorial";

export interface SourceExtractorSuccess {
  readonly ok: true;
  readonly document: ExtractedSourceDocument;
}

export interface SourceExtractorFailure {
  readonly ok: false;
  readonly failure: SourceExtractionFailure;
}

/**
 * Nothing was attempted, because the credential the extractor needs is missing or unreadable.
 *
 * Kept apart from a failure on purpose. A failure is a claim about the page — it did not answer,
 * it answered with an error, it was too large — and every one of those sends an operator to look
 * at the URL. No request left this process, so there is nothing to say about the page, and
 * recording a retrieval that never happened would be a fabricated fact in a durable record.
 */
export interface SourceExtractorUnavailable {
  readonly ok: false;
  readonly unavailable: CredentialUnavailableError;
}

export type SourceExtractorResult =
  SourceExtractorSuccess | SourceExtractorFailure | SourceExtractorUnavailable;

export interface SourceExtractor {
  readonly descriptor: SourceExtractorDescriptor;
  extract(source: UrlSource): Promise<SourceExtractorResult>;
}
