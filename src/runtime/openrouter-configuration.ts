export class OpenRouterBaseUrlConfigurationError extends Error {
  readonly code = "STORYRAIL_OPENROUTER_BASE_URL_INVALID" as const;

  constructor() {
    super(
      "STORYRAIL_OPENROUTER_BASE_URL must be an absolute HTTP or HTTPS URL without credentials.",
    );
    this.name = "OpenRouterBaseUrlConfigurationError";
  }
}

export function resolveOpenRouterBaseUrl(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): string | null {
  const configured = environment.STORYRAIL_OPENROUTER_BASE_URL?.trim();
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
      throw new OpenRouterBaseUrlConfigurationError();
    return parsed.toString().replace(/\/+$/, "");
  } catch (error) {
    if (error instanceof OpenRouterBaseUrlConfigurationError) throw error;
    throw new OpenRouterBaseUrlConfigurationError();
  }
}
