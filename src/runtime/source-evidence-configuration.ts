export interface SourceEvidenceRuntimeConfiguration {
  readonly databaseUrl: string;
  readonly firecrawlApiKey: string;
}

export class SourceEvidenceRuntimeConfigurationError extends Error {
  constructor(readonly code: "STORYRAIL_DATABASE_URL_REQUIRED" | "FIRECRAWL_API_KEY_REQUIRED") {
    const variableName =
      code === "STORYRAIL_DATABASE_URL_REQUIRED" ? "STORYRAIL_DATABASE_URL" : "FIRECRAWL_API_KEY";

    super(`${variableName} is required.`);
    this.name = "SourceEvidenceRuntimeConfigurationError";
  }
}

function requireEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  variableName: "STORYRAIL_DATABASE_URL" | "FIRECRAWL_API_KEY",
  code: "STORYRAIL_DATABASE_URL_REQUIRED" | "FIRECRAWL_API_KEY_REQUIRED",
): string {
  const value = environment[variableName];

  if (value === undefined || value.trim().length === 0) {
    throw new SourceEvidenceRuntimeConfigurationError(code);
  }

  return value;
}

export function loadSourceEvidenceRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): SourceEvidenceRuntimeConfiguration {
  const databaseUrl = requireEnvironmentValue(
    environment,
    "STORYRAIL_DATABASE_URL",
    "STORYRAIL_DATABASE_URL_REQUIRED",
  );
  const firecrawlApiKey = requireEnvironmentValue(
    environment,
    "FIRECRAWL_API_KEY",
    "FIRECRAWL_API_KEY_REQUIRED",
  );

  return Object.freeze({ databaseUrl, firecrawlApiKey });
}
