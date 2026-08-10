export interface EvidencePreparationRuntimeConfiguration {
  readonly databaseUrl: string;
  readonly openRouterApiKey: string;
  readonly model: string;
}

export type EvidencePreparationConfigurationErrorCode =
  | "STORYRAIL_DATABASE_URL_REQUIRED"
  | "OPENROUTER_API_KEY_REQUIRED"
  | "STORYRAIL_EVIDENCE_PREPARATION_MODEL_REQUIRED";

export class EvidencePreparationRuntimeConfigurationError extends Error {
  constructor(readonly code: EvidencePreparationConfigurationErrorCode) {
    const variable =
      code === "STORYRAIL_DATABASE_URL_REQUIRED"
        ? "STORYRAIL_DATABASE_URL"
        : code === "OPENROUTER_API_KEY_REQUIRED"
          ? "OPENROUTER_API_KEY"
          : "STORYRAIL_EVIDENCE_PREPARATION_MODEL";
    super(`${variable} is required.`);
    this.name = "EvidencePreparationRuntimeConfigurationError";
  }
}

function required(
  environment: NodeJS.ProcessEnv,
  variable:
    "STORYRAIL_DATABASE_URL" | "OPENROUTER_API_KEY" | "STORYRAIL_EVIDENCE_PREPARATION_MODEL",
  code: EvidencePreparationConfigurationErrorCode,
): string {
  const value = environment[variable];
  if (value === undefined || value.trim().length === 0) {
    throw new EvidencePreparationRuntimeConfigurationError(code);
  }
  return value;
}

export function loadEvidencePreparationRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): EvidencePreparationRuntimeConfiguration {
  return Object.freeze({
    databaseUrl: required(environment, "STORYRAIL_DATABASE_URL", "STORYRAIL_DATABASE_URL_REQUIRED"),
    openRouterApiKey: required(environment, "OPENROUTER_API_KEY", "OPENROUTER_API_KEY_REQUIRED"),
    model: required(
      environment,
      "STORYRAIL_EVIDENCE_PREPARATION_MODEL",
      "STORYRAIL_EVIDENCE_PREPARATION_MODEL_REQUIRED",
    ),
  });
}
