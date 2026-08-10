import type {
  RecordSourceEvidencePreparationCommand,
  RecordSourceEvidencePreparationResult,
  SourceEvidencePreparationValidationCode,
} from "./source-evidence-preparation-types";

function invalid(
  code: SourceEvidencePreparationValidationCode,
  message: string,
): RecordSourceEvidencePreparationResult {
  return { ok: false, error: { code, message } };
}

export function recordSourceEvidencePreparation(
  command: RecordSourceEvidencePreparationCommand,
): RecordSourceEvidencePreparationResult {
  const provider = command.model.provider.trim();
  if (provider.length === 0) {
    return invalid("PREPARATION_PROVIDER_REQUIRED", "A model provider is required.");
  }
  const model = command.model.model.trim();
  if (model.length === 0) {
    return invalid("PREPARATION_MODEL_REQUIRED", "A model identifier is required.");
  }
  const preparerKey = command.preparer.key.trim();
  if (preparerKey.length === 0) {
    return invalid("PREPARER_KEY_REQUIRED", "An evidence preparer key is required.");
  }
  const preparerVersion = command.preparer.version.trim();
  if (preparerVersion.length === 0) {
    return invalid("PREPARER_VERSION_REQUIRED", "An evidence preparer version is required.");
  }
  if (command.outcome === "succeeded" && command.document.content.trim().length === 0) {
    return invalid(
      "PREPARED_SOURCE_CONTENT_REQUIRED",
      "Successful evidence preparation requires non-empty Markdown content.",
    );
  }

  const common = {
    id: command.preparationId,
    sourceId: command.sourceId,
    extractionId: command.extractionId,
    model: { provider, model },
    preparer: { key: preparerKey, version: preparerVersion },
    requestedBy: structuredClone(command.requestedBy),
    startedAt: command.startedAt,
    completedAt: command.completedAt,
  };

  return command.outcome === "succeeded"
    ? {
        ok: true,
        preparation: {
          ...common,
          outcome: "succeeded",
          document: structuredClone(command.document),
        },
      }
    : {
        ok: true,
        preparation: {
          ...common,
          outcome: "failed",
          failure: { ...command.failure },
        },
      };
}
