/**
 * The one place `STORYRAIL_CREDENTIAL_KEY` is read.
 *
 * It cannot live in the store it protects, for the same reason the database URL cannot live in
 * the database. An absent key is not a startup failure on its own — an installation that has
 * never had a credential entered has nothing to decrypt — so the absence is carried as null and
 * named at the credential it prevents being read.
 */
export function resolveCredentialKey(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): string | null {
  return environment.STORYRAIL_CREDENTIAL_KEY?.trim() || null;
}
