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
  const { rawCharacters, submittedCharacters } = command.input;
  if (
    !Number.isInteger(rawCharacters) ||
    !Number.isInteger(submittedCharacters) ||
    rawCharacters < 0 ||
    submittedCharacters < 0 ||
    submittedCharacters > rawCharacters
  ) {
    return invalid(
      "PREPARATION_INPUT_MEASUREMENT_INVALID",
      "Preparation input lengths must be non-negative integers, and the submitted length cannot exceed the raw length.",
    );
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
    input: { rawCharacters, submittedCharacters },
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
