/**
 * Static scaffolding for the signed-in shell.
 *
 * None of this is wired to anything: there is no authentication, no account, and no settings
 * persistence in StoryRail yet. It exists so the signed-in layout can be judged as a layout —
 * where an account menu belongs, what Settings should hold — before any of it is built.
 *
 * The values are drawn from the milestones already on the roadmap (bring-your-own model keys,
 * fallback extraction, knowledge sources, publishing destinations) so the shape is realistic.
 * Anything shown as connected reflects what the pre-alpha actually runs on today.
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

export interface ScaffoldSection {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly fields?: readonly ScaffoldField[];
  readonly connectors?: readonly ScaffoldConnector[];
}

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
    connectors: [
      {
        name: "OpenRouter",
        detail: "Key configured · routes to many providers",
        status: "connected",
      },
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
      { label: "Assignment Editor", value: "openrouter/free" },
      { label: "Writer", value: "openrouter/free" },
      {
        label: "Director",
        value: "google/gemini-3.7-flash",
        hint: "Needs a model that can hold the full review schema.",
      },
      { label: "Evidence preparation", value: "openrouter/free" },
      { label: "Request timeout", value: "60 seconds" },
      { label: "Evidence sent per preparation", value: "60,000 characters" },
    ],
  },
  {
    id: "extraction",
    title: "Evidence extraction",
    summary: "How a submitted URL becomes preserved evidence, and what happens when it fails.",
    connectors: [
      { name: "Firecrawl", detail: "v2 scrape · automatic proxy strategy", status: "connected" },
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
    id: "destinations",
    title: "Publishing destinations",
    summary:
      "Where a published Story is delivered. Publishing records the decision today; it does not deliver.",
    connectors: [
      { name: "StudioCMS", detail: "Publish through the StudioCMS API", status: "planned" },
      { name: "Ghost", detail: "Publish to a Ghost site", status: "planned" },
      { name: "WordPress", detail: "Publish through the WordPress REST API", status: "planned" },
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
