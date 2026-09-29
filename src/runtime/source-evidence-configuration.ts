import { resolveCredentialKey } from "./credential-configuration";

/**
 * What this runtime needs before it can be built, which is now only how to reach the database and
 * how to read what the database is holding. The connector credentials and the model identifiers
 * it used to take are per-Site values resolved when a run needs them.
 */
export interface SourceEvidenceRuntimeConfiguration {
  readonly databaseUrl: string;
  /** Null when no key is set. An installation with no credentials stored still starts. */
  readonly credentialKey: string | null;
}

export class SourceEvidenceRuntimeConfigurationError extends Error {
  readonly code = "STORYRAIL_DATABASE_URL_REQUIRED" as const;

  constructor() {
    super("STORYRAIL_DATABASE_URL is required.");
    this.name = "SourceEvidenceRuntimeConfigurationError";
  }
}

export function loadSourceEvidenceRuntimeConfiguration(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): SourceEvidenceRuntimeConfiguration {
  const databaseUrl = environment.STORYRAIL_DATABASE_URL?.trim();
  if (!databaseUrl) throw new SourceEvidenceRuntimeConfigurationError();
  return Object.freeze({ databaseUrl, credentialKey: resolveCredentialKey(environment) });
}

export class FirecrawlBaseUrlConfigurationError extends Error {
  readonly code = "STORYRAIL_FIRECRAWL_BASE_URL_INVALID" as const;

  constructor() {
    super(
      "STORYRAIL_FIRECRAWL_BASE_URL must be an absolute HTTP or HTTPS URL without credentials.",
    );
    this.name = "FirecrawlBaseUrlConfigurationError";
  }
}

/** The optional Firecrawl-compatible endpoint override, or null for Firecrawl's hosted API. */
export function resolveFirecrawlBaseUrl(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): string | null {
  const configured = environment.STORYRAIL_FIRECRAWL_BASE_URL?.trim();
  if (!configured) return null;
  try {
    const parsed = new URL(configured);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.hostname.length === 0 ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0
    )
      throw new FirecrawlBaseUrlConfigurationError();
    return parsed.toString().replace(/\/+$/, "");
  } catch (error) {
    if (error instanceof FirecrawlBaseUrlConfigurationError) throw error;
    throw new FirecrawlBaseUrlConfigurationError();
  }
}
