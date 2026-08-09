import type { SourceExtractor } from "@/adapters/source-extraction";
import {
  recordSourceExtraction,
  type EditorialActor,
  type RecordSourceExtractionResult,
  type SourceExtractionId,
  type UrlSource,
} from "@/domain/editorial";

export interface RunSourceExtractionCommand {
  readonly source: UrlSource;
  readonly requestedBy: EditorialActor;
}

export interface RunSourceExtractionDependencies {
  readonly extractor: SourceExtractor;
  readonly createExtractionId: () => SourceExtractionId;
  readonly now: () => string;
}

export type RunSourceExtraction = (
  command: RunSourceExtractionCommand,
) => Promise<RecordSourceExtractionResult>;

export function createRunSourceExtraction(
  dependencies: RunSourceExtractionDependencies,
): RunSourceExtraction {
  return async (command) => {
    const extractionId = dependencies.createExtractionId();
    const startedAt = dependencies.now();
    const extractionResult = await dependencies.extractor.extract(command.source);
    const completedAt = dependencies.now();

    if (extractionResult.ok) {
      return recordSourceExtraction({
        extractionId,
        source: command.source,
        extractor: dependencies.extractor.descriptor,
        requestedBy: command.requestedBy,
        startedAt,
        completedAt,
        outcome: "succeeded",
        document: extractionResult.document,
      });
    }

    return recordSourceExtraction({
      extractionId,
      source: command.source,
      extractor: dependencies.extractor.descriptor,
      requestedBy: command.requestedBy,
      startedAt,
      completedAt,
      outcome: "failed",
      failure: extractionResult.failure,
    });
  };
}
