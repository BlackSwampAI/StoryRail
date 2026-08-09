import type {
  RecordSourceExtractionCommand,
  RecordSourceExtractionResult,
  SourceExtractionValidationError,
} from "./source-extraction-types";

function validationFailure(
  code: SourceExtractionValidationError["code"],
  message: string,
): RecordSourceExtractionResult {
  return {
    ok: false,
    error: { code, message },
  };
}

export function recordSourceExtraction(
  command: RecordSourceExtractionCommand,
): RecordSourceExtractionResult {
  const extractorKey = command.extractor.key.trim();

  if (extractorKey.length === 0) {
    return validationFailure(
      "SOURCE_EXTRACTOR_KEY_REQUIRED",
      "A Source extractor key is required.",
    );
  }

  const extractorVersion = command.extractor.version.trim();

  if (extractorVersion.length === 0) {
    return validationFailure(
      "SOURCE_EXTRACTOR_VERSION_REQUIRED",
      "A Source extractor version is required.",
    );
  }

  if (command.outcome === "succeeded" && command.document.content.trim().length === 0) {
    return validationFailure(
      "EXTRACTED_SOURCE_CONTENT_REQUIRED",
      "Successful Source extraction requires non-empty Markdown content.",
    );
  }

  const common = {
    id: command.extractionId,
    sourceId: command.source.id,
    extractor: {
      key: extractorKey,
      version: extractorVersion,
    },
    requestedBy: command.requestedBy,
    startedAt: command.startedAt,
    completedAt: command.completedAt,
  };

  if (command.outcome === "succeeded") {
    return {
      ok: true,
      extraction: {
        ...common,
        outcome: "succeeded",
        document: {
          format: command.document.format,
          content: command.document.content,
          title: command.document.title,
          byline: command.document.byline,
          publishedAt: command.document.publishedAt,
          language: command.document.language,
        },
      },
    };
  }

  return {
    ok: true,
    extraction: {
      ...common,
      outcome: "failed",
      failure: {
        code: command.failure.code,
        retryable: command.failure.retryable,
      },
    },
  };
}
