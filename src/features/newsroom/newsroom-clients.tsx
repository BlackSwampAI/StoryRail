"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { siteId, type Site, type SiteId } from "@/domain/editorial";

import { createAgentProfileClient, type AgentProfileClient } from "./agent-profile-client";
import { createModelCatalogClient, type ModelCatalogClient } from "./model-catalog-client";
import {
  createNewsroomStandardsClient,
  type NewsroomStandardsClient,
} from "./newsroom-standards-client";
import { createSiteSettingsClient, type SiteSettingsClient } from "./site-settings-client";
import {
  createSourceEvidenceUrlClient,
  type RequestSourceEvidenceUrl,
} from "./source-evidence-url-client";
import { createSourceInboxClient, type SourceInboxClient } from "./source-inbox-client";
import { createStoryClient, type StoryClient } from "./story-client";
import { createUrlAutopilotClient, type UrlAutopilotClient } from "./url-autopilot-client";

export interface NewsroomClients {
  readonly stories: StoryClient;
  readonly sourceInbox: SourceInboxClient;
  readonly agentProfiles: AgentProfileClient;
  readonly siteSettings: SiteSettingsClient;
  readonly modelCatalog: ModelCatalogClient;
  readonly newsroomStandards: NewsroomStandardsClient;
  readonly requestSourceEvidenceUrl: RequestSourceEvidenceUrl;
  readonly urlAutopilot: UrlAutopilotClient;
}

export interface NewsroomSiteValue {
  readonly site: Site;
  readonly sites: readonly Site[];
  readonly clients: NewsroomClients;
}

export function createNewsroomClients(
  site: SiteId,
  fetchImplementation: typeof globalThis.fetch,
): NewsroomClients {
  return Object.freeze({
    stories: createStoryClient({ siteId: site, fetch: fetchImplementation }),
    sourceInbox: createSourceInboxClient({ siteId: site, fetch: fetchImplementation }),
    agentProfiles: createAgentProfileClient({ siteId: site, fetch: fetchImplementation }),
    siteSettings: createSiteSettingsClient({ siteId: site, fetch: fetchImplementation }),
    modelCatalog: createModelCatalogClient({ siteId: site, fetch: fetchImplementation }),
    newsroomStandards: createNewsroomStandardsClient({ siteId: site, fetch: fetchImplementation }),
    requestSourceEvidenceUrl: createSourceEvidenceUrlClient({
      siteId: site,
      fetch: fetchImplementation,
    }),
    urlAutopilot: createUrlAutopilotClient({ siteId: site, fetch: fetchImplementation }),
  });
}

/**
 * What a component gets when it is rendered outside a Site.
 *
 * Every request fails rather than guessing a tenant. Falling back to the installation's first
 * Site would be the worst of the available answers: it would work on a single-site install and
 * quietly write to the wrong newsroom everywhere else.
 */
const CLIENTS_WITHOUT_A_SITE = createNewsroomClients(siteId(""), () =>
  Promise.reject(new Error("No Site is selected, so the newsroom cannot be reached.")),
);

const NewsroomSiteContext = createContext<NewsroomSiteValue | null>(null);

export function NewsroomSiteProvider({
  site,
  sites,
  clients,
  children,
}: {
  readonly site: Site;
  readonly sites: readonly Site[];
  readonly clients?: NewsroomClients;
  readonly children: ReactNode;
}) {
  const value = useMemo<NewsroomSiteValue>(
    () => ({
      site,
      sites,
      clients: clients ?? createNewsroomClients(site.id, (input, init) => fetch(input, init)),
    }),
    [site, sites, clients],
  );

  return <NewsroomSiteContext.Provider value={value}>{children}</NewsroomSiteContext.Provider>;
}

export function useNewsroomSite(): NewsroomSiteValue | null {
  return useContext(NewsroomSiteContext);
}

export function useNewsroomClients(): NewsroomClients {
  return useContext(NewsroomSiteContext)?.clients ?? CLIENTS_WITHOUT_A_SITE;
}
