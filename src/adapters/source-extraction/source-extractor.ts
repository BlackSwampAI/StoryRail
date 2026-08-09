import type {
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

export type SourceExtractorResult = SourceExtractorSuccess | SourceExtractorFailure;

export interface SourceExtractor {
  readonly descriptor: SourceExtractorDescriptor;
  extract(source: UrlSource): Promise<SourceExtractorResult>;
}
