import { resolveCredentialKey } from "./credential-configuration";

/**
 * What this runtime needs before it can be built, which is now only how to reach the database and
 * how to read what the database is holding. The connector credentials and the model identifiers
 * it used to take are per-Site values resolved when a run needs them.
 */
export interface EvidencePreparationRuntimeConfiguration {
  readonly databaseUrl: string;
  /** Null when no key is set. An installation with no credentials stored still starts. */
  readonly credentialKey: string | null;
}

export class EvidencePreparationRuntimeConfigurationError extends Error {
  readonly code = "STORYRAIL_DATABASE_URL_REQUIRED" as const;

  constructor() {
    super("STORYRAIL_DATABASE_URL is required.");
    this.name = "EvidencePreparationRuntimeConfigurationError";
  }
}

export function loadEvidencePreparationRuntimeConfiguration(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): EvidencePreparationRuntimeConfiguration {
  const databaseUrl = environment.STORYRAIL_DATABASE_URL?.trim();
  if (!databaseUrl) throw new EvidencePreparationRuntimeConfigurationError();
  return Object.freeze({ databaseUrl, credentialKey: resolveCredentialKey(environment) });
}
