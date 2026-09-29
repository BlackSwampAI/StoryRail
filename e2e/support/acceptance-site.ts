import { randomUUID } from "node:crypto";

import { expect, type APIRequestContext } from "@playwright/test";

import { siteId, type SiteId } from "@/domain/editorial";

export const ACCEPTANCE_OPERATOR_ID = "acceptance-operator";

export interface AcceptanceSite {
  readonly id: SiteId;
  /** The Site-scoped API prefix, without a trailing slash. */
  readonly api: string;
  readonly domain: string;
  readonly unique: string;
}

/** Creates a Site that no other test shares, so a test never sees another test's newsroom. */
export async function createAcceptanceSite(
  request: APIRequestContext,
  label: string,
): Promise<AcceptanceSite> {
  const unique = randomUUID();
  const domain = `${label}-${unique}.acceptance.storyrail.test`;
  const created = await request.post("/api/sites", {
    data: {
      name: `Acceptance Newsroom ${label}`,
      domain,
      description: `Isolated newsroom for the ${label} acceptance journey.`,
    },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as { site: { id: string } };
  const id = siteId(body.site.id);
  return { id, api: `/api/sites/${encodeURIComponent(id)}`, domain, unique };
}

/**
 * Points a Site at the local acceptance stub for every external service autopilot reaches:
 * OpenRouter models, Firecrawl extraction, and a WordPress destination.
 */
export async function configureAcceptanceProviders(
  request: APIRequestContext,
  site: AcceptanceSite,
): Promise<void> {
  const model = "openai/gpt-4o-mini";
  const settings = await request.put(`${site.api}/site-settings`, {
    data: {
      models: {
        evidencePreparation: model,
        assignmentEditor: model,
        writer: model,
        director: model,
        researcher: model,
      },
      destination: {
        kind: "wordpress",
        baseUrl: "http://127.0.0.1:3135",
        username: "acceptance",
        draft: false,
      },
    },
  });
  expect(settings.ok()).toBeTruthy();
  for (const [slot, secret] of [
    ["openrouter_api_key", "acceptance-openrouter-key"],
    ["firecrawl_api_key", "acceptance-firecrawl-key"],
    ["wordpress_application_password", "acceptance-wordpress-password"],
  ] as const) {
    const stored = await request.put(`${site.api}/site-credentials/${slot}`, {
      data: { secret },
    });
    expect(stored.ok()).toBeTruthy();
  }
}
