import { resolveCredentialKey } from "./credential-configuration";
import { resolveOpenRouterBaseUrl } from "./openrouter-configuration";

/**
 * What this runtime needs before it can be built: how to reach the database, how to read its
 * encrypted values, and an optional installation-level provider endpoint. Connector credentials
 * and model identifiers remain per-Site values resolved when a run needs them.
 */
export interface WriterRuntimeConfiguration {
  readonly databaseUrl: string;
  readonly openRouterBaseUrl: string | null;
  /** Null when no key is set. An installation with no credentials stored still starts. */
  readonly credentialKey: string | null;
}

export class WriterRuntimeConfigurationError extends Error {
  readonly code = "STORYRAIL_DATABASE_URL_REQUIRED" as const;

  constructor() {
    super("STORYRAIL_DATABASE_URL is required.");
    this.name = "WriterRuntimeConfigurationError";
  }
}

export function loadWriterRuntimeConfiguration(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): WriterRuntimeConfiguration {
  const databaseUrl = environment.STORYRAIL_DATABASE_URL?.trim();
  if (!databaseUrl) throw new WriterRuntimeConfigurationError();
  return Object.freeze({
    databaseUrl,
    credentialKey: resolveCredentialKey(environment),
    openRouterBaseUrl: resolveOpenRouterBaseUrl(environment),
  });
}
