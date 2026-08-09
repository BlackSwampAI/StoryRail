import type { EditorialActor, SourceExtraction, UrlSource } from "@/domain/editorial";

import type {
  ExtractPersistedSource,
  ExtractPersistedSourceResult,
} from "./extract-persisted-source";
import type { PreserveUrlSource, PreserveUrlSourceResult } from "./preserve-url-source";

export interface PreserveAndExtractUrlSourceCommand {
  readonly submittedUrl: string;
  readonly submittedBy: EditorialActor;
}

export interface PreserveAndExtractUrlSourceDependencies {
  readonly preserveUrlSource: PreserveUrlSource;
  readonly extractPersistedSource: ExtractPersistedSource;
}

export type PreserveUrlSourceFailureError = Extract<
  PreserveUrlSourceResult,
  { readonly ok: false }
>["error"];

export type ExtractPersistedSourceFailureError = Extract<
  ExtractPersistedSourceResult,
  { readonly ok: false }
>["error"];

export type PreserveAndExtractUrlSourceResult =
  | {
      readonly ok: true;
      readonly source: UrlSource;
      readonly extraction: SourceExtraction;
    }
  | {
      readonly ok: false;
      readonly stage: "preservation";
      readonly error: PreserveUrlSourceFailureError;
    }
  | {
      readonly ok: false;
      readonly stage: "extraction";
      readonly source: UrlSource;
      readonly error: ExtractPersistedSourceFailureError;
    };

export type PreserveAndExtractUrlSource = (
  command: PreserveAndExtractUrlSourceCommand,
) => Promise<PreserveAndExtractUrlSourceResult>;

export function createPreserveAndExtractUrlSource(
  dependencies: PreserveAndExtractUrlSourceDependencies,
): PreserveAndExtractUrlSource {
  return async (command) => {
    const preservation = await dependencies.preserveUrlSource({
      submittedUrl: command.submittedUrl,
      submittedBy: command.submittedBy,
    });

    if (!preservation.ok) {
      return {
        ok: false,
        stage: "preservation",
        error: preservation.error,
      };
    }

    const extraction = await dependencies.extractPersistedSource({
      sourceId: preservation.source.id,
      requestedBy: command.submittedBy,
    });

    if (!extraction.ok) {
      return {
        ok: false,
        stage: "extraction",
        source: preservation.source,
        error: extraction.error,
      };
    }

    return {
      ok: true,
      source: preservation.source,
      extraction: extraction.extraction,
    };
  };
}
