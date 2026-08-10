import type { SourceEvidencePreparation, SourceExtraction, UrlSource } from "@/domain/editorial";

export interface SourceInboxItem {
  readonly source: UrlSource;
  readonly extractions: readonly SourceExtraction[];
  readonly preparations: readonly SourceEvidencePreparation[];
}

export interface SourceInboxRepository {
  listPending(): Promise<readonly SourceInboxItem[]>;
}
