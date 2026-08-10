import type { SourceExtraction, UrlSource } from "@/domain/editorial";

export interface SourceInboxItem {
  readonly source: UrlSource;
  readonly extractions: readonly SourceExtraction[];
}

export interface SourceInboxRepository {
  listPending(): Promise<readonly SourceInboxItem[]>;
}
