export interface DirectorRuntimeConfiguration {
  readonly databaseUrl: string;
  readonly openRouterApiKey: string;
  readonly defaultModel: string | null;
}

export class DirectorRuntimeConfigurationError extends Error {
  readonly code: "STORYRAIL_DATABASE_URL_REQUIRED" | "OPENROUTER_API_KEY_REQUIRED";
  constructor(code: DirectorRuntimeConfigurationError["code"]) {
    super(
      `${code === "STORYRAIL_DATABASE_URL_REQUIRED" ? "STORYRAIL_DATABASE_URL" : "OPENROUTER_API_KEY"} is required.`,
    );
    this.code = code;
    this.name = "DirectorRuntimeConfigurationError";
  }
}

export function loadDirectorRuntimeConfiguration(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): DirectorRuntimeConfiguration {
  const databaseUrl = environment.STORYRAIL_DATABASE_URL?.trim();
  const openRouterApiKey = environment.OPENROUTER_API_KEY?.trim();
  if (!databaseUrl) throw new DirectorRuntimeConfigurationError("STORYRAIL_DATABASE_URL_REQUIRED");
  if (!openRouterApiKey) throw new DirectorRuntimeConfigurationError("OPENROUTER_API_KEY_REQUIRED");
  return Object.freeze({
    databaseUrl,
    openRouterApiKey,
    defaultModel: environment.STORYRAIL_DIRECTOR_MODEL?.trim() || null,
  });
}
