import type { CanonicalizeSiteDomainResult } from "./site-types";

/** Long enough for any real hostname; a fully qualified domain name cannot exceed 253 octets. */
export const MAX_SITE_DOMAIN_LENGTH = 253;

const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Reduce what an operator typed to the one spelling of a hostname the database will accept.
 *
 * The `sites_payload_domain_check` constraint requires a lowercase, trimmed, non-empty domain,
 * which is right — hostnames are case-insensitive, so storing `Example.com` beside `example.com`
 * would be two rows meaning one website. Without a canonicalisation step, though, the operator who
 * types the name of their site the way it appears on their letterhead gets a raw constraint
 * violation instead of the row they asked for. This mirrors `canonicalizeSourceUrl`: the
 * correction happens once, in the domain, before anything downstream can disagree about it.
 */
export function canonicalizeSiteDomain(submittedDomain: string): CanonicalizeSiteDomainResult {
  const trimmed = submittedDomain.trim().toLowerCase();

  if (trimmed.length === 0) {
    return {
      ok: false,
      error: { code: "SITE_DOMAIN_REQUIRED", message: "A Site domain is required." },
    };
  }

  if (trimmed.length > MAX_SITE_DOMAIN_LENGTH) {
    return {
      ok: false,
      error: {
        code: "SITE_DOMAIN_TOO_LONG",
        message: `A Site domain cannot exceed ${MAX_SITE_DOMAIN_LENGTH} characters.`,
      },
    };
  }

  // An operator pasting from a browser bar brings a scheme, a path, or a trailing dot with them.
  // Accepting a bare hostname only is the narrow reading, and it keeps the stored value the thing
  // that will later be compared against a request's Host header.
  const withoutTrailingDot = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  const labels = withoutTrailingDot.split(".");

  if (withoutTrailingDot.length === 0 || !labels.every((label) => LABEL.test(label))) {
    return {
      ok: false,
      error: {
        code: "INVALID_SITE_DOMAIN",
        message: "A Site domain must be a hostname, such as example.com, without a scheme or path.",
      },
    };
  }

  return { ok: true, domain: withoutTrailingDot };
}
