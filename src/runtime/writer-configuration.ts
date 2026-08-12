export interface WriterRuntimeConfiguration {
  readonly databaseUrl: string;
  readonly openRouterApiKey: string;
  readonly defaultModel: string | null;
}

export class WriterRuntimeConfigurationError extends Error {
  readonly code: "STORYRAIL_DATABASE_URL_REQUIRED" | "OPENROUTER_API_KEY_REQUIRED";
  constructor(code: WriterRuntimeConfigurationError["code"]) {
    super(
      `${code === "STORYRAIL_DATABASE_URL_REQUIRED" ? "STORYRAIL_DATABASE_URL" : "OPENROUTER_API_KEY"} is required.`,
    );
    this.code = code;
    this.name = "WriterRuntimeConfigurationError";
  }
}

export function loadWriterRuntimeConfiguration(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): WriterRuntimeConfiguration {
  const databaseUrl = environment.STORYRAIL_DATABASE_URL?.trim();
  const openRouterApiKey = environment.OPENROUTER_API_KEY?.trim();
  if (!databaseUrl) throw new WriterRuntimeConfigurationError("STORYRAIL_DATABASE_URL_REQUIRED");
  if (!openRouterApiKey) throw new WriterRuntimeConfigurationError("OPENROUTER_API_KEY_REQUIRED");
  return Object.freeze({
    databaseUrl,
    openRouterApiKey,
    defaultModel: environment.STORYRAIL_WRITER_MODEL?.trim() || null,
  });
}
