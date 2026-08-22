export interface ResearcherRuntimeConfiguration {
  readonly databaseUrl: string;
  readonly openRouterApiKey: string;
  readonly firecrawlApiKey: string;
  readonly defaultModel: string | null;
}

export class ResearcherRuntimeConfigurationError extends Error {
  readonly code:
    | "STORYRAIL_DATABASE_URL_REQUIRED"
    | "OPENROUTER_API_KEY_REQUIRED"
    | "FIRECRAWL_API_KEY_REQUIRED";
  constructor(code: ResearcherRuntimeConfigurationError["code"]) {
    super(`${code.replace("_REQUIRED", "")} is required.`);
    this.code = code;
    this.name = "ResearcherRuntimeConfigurationError";
  }
}

/**
 * Research needs a way to retrieve as well as a way to reason, so retrieval is part of the
 * runtime's configuration rather than something discovered when the first tool call fails.
 */
export function loadResearcherRuntimeConfiguration(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): ResearcherRuntimeConfiguration {
  const databaseUrl = environment.STORYRAIL_DATABASE_URL?.trim();
  const openRouterApiKey = environment.OPENROUTER_API_KEY?.trim();
  const firecrawlApiKey = environment.FIRECRAWL_API_KEY?.trim();
  if (!databaseUrl)
    throw new ResearcherRuntimeConfigurationError("STORYRAIL_DATABASE_URL_REQUIRED");
  if (!openRouterApiKey)
    throw new ResearcherRuntimeConfigurationError("OPENROUTER_API_KEY_REQUIRED");
  if (!firecrawlApiKey) throw new ResearcherRuntimeConfigurationError("FIRECRAWL_API_KEY_REQUIRED");
  return Object.freeze({
    databaseUrl,
    openRouterApiKey,
    firecrawlApiKey,
    defaultModel: environment.STORYRAIL_RESEARCHER_MODEL?.trim() || null,
  });
}
