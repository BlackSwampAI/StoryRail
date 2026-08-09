import type {
  CanonicalSourceUrl,
  DuplicateSourceError,
  SourceExtraction,
  SourceExtractionId,
  SourceId,
  UrlSource,
} from "@/domain/editorial";

export interface PersistUrlSourceCommand {
  readonly source: UrlSource;
}

export interface SourceIdConflictError {
  readonly code: "SOURCE_ID_CONFLICT";
  readonly message: string;
  readonly sourceId: SourceId;
}

export type PersistUrlSourceResult =
  | {
      readonly ok: true;
      readonly source: UrlSource;
    }
  | {
      readonly ok: false;
      readonly error: DuplicateSourceError | SourceIdConflictError;
    };

export interface AppendSourceExtractionCommand {
  readonly extraction: SourceExtraction;
}

export interface SourceNotFoundError {
  readonly code: "SOURCE_NOT_FOUND";
  readonly message: string;
  readonly sourceId: SourceId;
}

export interface SourceExtractionIdConflictError {
  readonly code: "SOURCE_EXTRACTION_ID_CONFLICT";
  readonly message: string;
  readonly extractionId: SourceExtractionId;
}

export type AppendSourceExtractionResult =
  | {
      readonly ok: true;
      readonly extraction: SourceExtraction;
    }
  | {
      readonly ok: false;
      readonly error: SourceNotFoundError | SourceExtractionIdConflictError;
    };

export interface UrlSourceRepository {
  persist(command: PersistUrlSourceCommand): Promise<PersistUrlSourceResult>;

  findById(sourceId: SourceId): Promise<UrlSource | null>;

  findByCanonicalUrl(canonicalUrl: CanonicalSourceUrl): Promise<UrlSource | null>;
}

export interface SourceExtractionRepository {
  append(command: AppendSourceExtractionCommand): Promise<AppendSourceExtractionResult>;

  listBySourceId(sourceId: SourceId): Promise<readonly SourceExtraction[]>;
}
