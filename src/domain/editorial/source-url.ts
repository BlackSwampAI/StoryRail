import type { CanonicalizeSourceUrlResult, CanonicalSourceUrl } from "./source-types";

export const MAX_SUBMITTED_SOURCE_URL_LENGTH = 2_048;

const TRACKING_PARAMETER_NAMES = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
]);

function isTrackingParameter(name: string): boolean {
  const normalizedName = name.toLowerCase();

  return normalizedName.startsWith("utm_") || TRACKING_PARAMETER_NAMES.has(normalizedName);
}

export function canonicalizeSourceUrl(submittedUrl: string): CanonicalizeSourceUrlResult {
  if (submittedUrl.length > MAX_SUBMITTED_SOURCE_URL_LENGTH) {
    return {
      ok: false,
      error: {
        code: "SOURCE_URL_TOO_LONG",
        message: `A submitted Source URL cannot exceed ${MAX_SUBMITTED_SOURCE_URL_LENGTH} characters.`,
        maximumLength: MAX_SUBMITTED_SOURCE_URL_LENGTH,
      },
    };
  }

  const valueForParsing = submittedUrl.trim();

  if (valueForParsing.length === 0) {
    return {
      ok: false,
      error: {
        code: "SOURCE_URL_REQUIRED",
        message: "A Source URL is required.",
      },
    };
  }

  let url: URL;

  try {
    url = new URL(valueForParsing);
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_SOURCE_URL",
        message: "The submitted Source URL must be a valid absolute URL.",
      },
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_SOURCE_PROTOCOL",
        message: "Source URLs must use the HTTP or HTTPS protocol.",
      },
    };
  }

  if (url.username.length > 0 || url.password.length > 0) {
    return {
      ok: false,
      error: {
        code: "SOURCE_URL_CREDENTIALS_NOT_ALLOWED",
        message: "Source URLs must not contain embedded credentials.",
      },
    };
  }

  const parameterNames = Array.from(url.searchParams.keys());

  for (const parameterName of parameterNames) {
    if (isTrackingParameter(parameterName)) {
      url.searchParams.delete(parameterName);
    }
  }

  if (url.searchParams.size === 0) {
    url.search = "";
  }

  url.hash = "";

  return {
    ok: true,
    canonicalUrl: url.href as CanonicalSourceUrl,
  };
}
