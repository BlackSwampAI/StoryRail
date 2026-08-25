import {
  FIRECRAWL_API_KEY_SLOT,
  OPENROUTER_API_KEY_SLOT,
  STUDIOCMS_API_TOKEN_SLOT,
  WORDPRESS_APPLICATION_PASSWORD_SLOT,
  type CredentialSlot,
} from "@/domain/editorial";

/**
 * Scaffolding for the signed-in shell, and the layout the parts that are real sit inside.
 *
 * There is still no authentication and no account here. What has changed is that some of the
 * settings are now stored: the OpenRouter and Firecrawl credentials and the five agent model
 * ids live in the per-site store, so those rows are declared here as slots to be filled from
 * `GET /api/site-settings` rather than as values.
 *
 * Nothing in this file may claim a connector is connected. It said so of OpenRouter and
 * Firecrawl before the store existed, which was true only by coincidence and would have gone on
 * reading "Connected" on an installation with no keys at all.
 */

export type ConnectionStatus = "connected" | "available" | "planned";

export interface ScaffoldOperator {
  readonly displayName: string;
  readonly handle: string;
  readonly role: string;
  readonly newsroom: string;
  readonly initials: string;
}

export const SCAFFOLD_OPERATOR: ScaffoldOperator = {
  displayName: "Newsroom Operator",
  handle: "chris-local",
  role: "Editor in chief",
  newsroom: "Black Swamp Newsroom",
  initials: "NO",
};

export interface ScaffoldField {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

export interface ScaffoldConnector {
  readonly name: string;
  readonly detail: string;
  readonly status: ConnectionStatus;
}

/**
 * A connector whose state is stored rather than declared. It carries no status, because the only
 * honest answer to "is this connected" comes from the credential store.
 */
export interface ScaffoldStoredConnector {
  readonly name: string;
  readonly detail: string;
  readonly slot: CredentialSlot;
  readonly label: string;
}

export interface ScaffoldSection {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly fields?: readonly ScaffoldField[];
  readonly connectors?: readonly ScaffoldConnector[];
  readonly storedConnectors?: readonly ScaffoldStoredConnector[];
}

/** The section whose fields are the stored agent model ids rather than static text. */
export const AGENT_MODELS_SECTION_ID = "agent-models";

/** The section whose form is the stored destination rather than a list of intentions. */
export const DESTINATIONS_SECTION_ID = "destinations";

export const SCAFFOLD_SETTINGS: readonly ScaffoldSection[] = [
  {
    id: "newsroom",
    title: "Newsroom",
    summary: "How this newsroom identifies itself and what it defaults to.",
    fields: [
      { label: "Newsroom name", value: "Black Swamp Newsroom" },
      { label: "Operator", value: "chris-local", hint: "Set by STORYRAIL_OPERATOR_ID today." },
      { label: "Time zone", value: "America/New_York" },
      { label: "Default language", value: "English (United States)" },
    ],
  },
  {
    id: "model-providers",
    title: "Model providers",
    summary: "Bring your own keys. Every agent run records the provider and model it used.",
    storedConnectors: [
      {
        name: "OpenRouter",
        detail: "One key routes every agent role to many providers.",
        slot: OPENROUTER_API_KEY_SLOT,
        label: "OpenRouter API key",
      },
    ],
    connectors: [
      { name: "Anthropic", detail: "Claude models with a direct key", status: "available" },
      { name: "OpenAI", detail: "GPT models with a direct key", status: "available" },
      { name: "Google", detail: "Gemini models with a direct key", status: "available" },
      { name: "Amazon Bedrock", detail: "Models through an AWS account", status: "planned" },
    ],
  },
  {
    id: "agent-models",
    title: "Agent models",
    summary: "Which model each supervised role runs on. A role may override the newsroom default.",
    fields: [
      { label: "Request timeout", value: "60 seconds" },
      { label: "Evidence sent per preparation", value: "60,000 characters" },
    ],
  },
  {
    id: "extraction",
    title: "Evidence extraction",
    summary: "How a submitted URL becomes preserved evidence, and what happens when it fails.",
    storedConnectors: [
      {
        name: "Firecrawl",
        detail: "v2 scrape · automatic proxy strategy",
        slot: FIRECRAWL_API_KEY_SLOT,
        label: "Firecrawl API key",
      },
    ],
    connectors: [
      { name: "Obscura", detail: "Planned optional extraction adapter", status: "planned" },
      {
        name: "Direct fetch",
        detail: "Fallback for pages that need no rendering",
        status: "planned",
      },
    ],
    fields: [
      {
        label: "Retry on failure",
        value: "Operator decides",
        hint: "Failed attempts stay in the Source's history.",
      },
      { label: "Minimum extracted length", value: "120 characters" },
    ],
  },
  {
    id: "knowledge",
    title: "Knowledge sources",
    summary: "Background material an agent may draw on beyond the Sources attached to a Story.",
    connectors: [
      { name: "Vector store", detail: "Embed and retrieve newsroom archives", status: "planned" },
      {
        name: "MCP servers",
        detail: "Tools and data over Model Context Protocol",
        status: "planned",
      },
      { name: "Style guide", detail: "House rules applied to every Writer run", status: "planned" },
    ],
  },
  {
    id: DESTINATIONS_SECTION_ID,
    title: "Publishing destinations",
    summary:
      "Where a published Story is delivered. The delivery is recorded before the request leaves, and a destination with no credential delivers nothing at all.",
    // Both slots are offered whichever kind is selected. They are separate credentials, so a
    // newsroom that moves between the two keeps the key it is not using rather than having to
    // find it again, and an operator can see at a glance which of the two is ready.
    storedConnectors: [
      {
        name: "StudioCMS",
        detail: "Bearer token from the StudioCMS dashboard.",
        slot: STUDIOCMS_API_TOKEN_SLOT,
        label: "StudioCMS API token",
      },
      {
        name: "WordPress",
        detail: "Application Password for the WordPress user named below.",
        slot: WORDPRESS_APPLICATION_PASSWORD_SLOT,
        label: "WordPress application password",
      },
    ],
    connectors: [
      { name: "Ghost", detail: "Publish to a Ghost site", status: "planned" },
      { name: "Webhook", detail: "Post the Article to any endpoint", status: "planned" },
    ],
  },
  {
    id: "members",
    title: "Members",
    summary: "Who can act in this newsroom. Every editorial decision is attributed to an operator.",
    fields: [
      { label: "Newsroom Operator", value: "Editor in chief · you" },
      { label: "Invite a colleague", value: "Not available yet" },
    ],
  },
];
