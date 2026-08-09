import type { RunSourceExtraction } from "@/application/source-extraction";
import type {
  EditorialActor,
  SourceExtraction,
  SourceExtractionValidationError,
  SourceId,
} from "@/domain/editorial";

import type {
  SourceExtractionIdConflictError,
  SourceExtractionRepository,
  SourceNotFoundError,
  UrlSourceRepository,
} from "../source-persistence";

export interface ExtractPersistedSourceCommand {
  readonly sourceId: SourceId;
  readonly requestedBy: EditorialActor;
}

export interface ExtractPersistedSourceDependencies {
  readonly sourceRepository: UrlSourceRepository;
  readonly extractionRepository: SourceExtractionRepository;
  readonly runSourceExtraction: RunSourceExtraction;
}

type ExtractPersistedSourceError =
  SourceNotFoundError | SourceExtractionValidationError | SourceExtractionIdConflictError;

export type ExtractPersistedSourceResult =
  | {
      readonly ok: true;
      readonly extraction: SourceExtraction;
    }
  | {
      readonly ok: false;
      readonly error: ExtractPersistedSourceError;
    };

export type ExtractPersistedSource = (
  command: ExtractPersistedSourceCommand,
) => Promise<ExtractPersistedSourceResult>;

export function createExtractPersistedSource(
  dependencies: ExtractPersistedSourceDependencies,
): ExtractPersistedSource {
  return async (command) => {
    const source = await dependencies.sourceRepository.findById(command.sourceId);

    if (!source) {
      return {
        ok: false,
        error: {
          code: "SOURCE_NOT_FOUND",
          message: "The Source referenced by the extraction does not exist.",
          sourceId: command.sourceId,
        },
      };
    }

    const extractionResult = await dependencies.runSourceExtraction({
      source,
      requestedBy: command.requestedBy,
    });

    if (!extractionResult.ok) {
      return extractionResult;
    }

    return dependencies.extractionRepository.append({
      extraction: extractionResult.extraction,
    });
  };
}
