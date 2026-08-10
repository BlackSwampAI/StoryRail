import type {
  SourceEvidencePreparation,
  SourceEvidencePreparationId,
  SourceExtractionId,
  SourceId,
} from "@/domain/editorial";

export type AppendSourceEvidencePreparationResult =
  | { readonly ok: true; readonly preparation: SourceEvidencePreparation }
  | {
      readonly ok: false;
      readonly error:
        | {
            readonly code: "SOURCE_EVIDENCE_PREPARATION_ID_CONFLICT";
            readonly message: string;
            readonly preparationId: SourceEvidencePreparationId;
          }
        | {
            readonly code: "SOURCE_EXTRACTION_NOT_FOUND";
            readonly message: string;
            readonly extractionId: SourceExtractionId;
          };
    };

export interface SourceEvidencePreparationRepository {
  append(preparation: SourceEvidencePreparation): Promise<AppendSourceEvidencePreparationResult>;
  listBySourceId(sourceId: SourceId): Promise<readonly SourceEvidencePreparation[]>;
}
