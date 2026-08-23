import type { SourceExtractor } from "@/adapters/source-extraction";
import {
  recordSourceExtraction,
  type CredentialUnavailableError,
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

/**
 * An extraction, or the reason there is not one.
 *
 * A credential that is missing or unreadable is not an extraction outcome. It is the reason no
 * extraction exists, which is why it leaves by the same door as a validation error rather than
 * as a `failed` record: a durable extraction says something happened, and nothing did.
 */
export type RunSourceExtractionResult =
  RecordSourceExtractionResult | { readonly ok: false; readonly error: CredentialUnavailableError };

export type RunSourceExtraction = (
  command: RunSourceExtractionCommand,
) => Promise<RunSourceExtractionResult>;

export function createRunSourceExtraction(
  dependencies: RunSourceExtractionDependencies,
): RunSourceExtraction {
  return async (command) => {
    const extractionId = dependencies.createExtractionId();
    const startedAt = dependencies.now();
    const extractionResult = await dependencies.extractor.extract(command.source);
    // Nothing was attempted, so nothing is recorded. Writing a failed extraction here would put
    // a retrieval that never happened into the Source's permanent history, and send whoever
    // reads it later to look at a page that was never asked for.
    if (!extractionResult.ok && "unavailable" in extractionResult)
      return { ok: false, error: extractionResult.unavailable };
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
