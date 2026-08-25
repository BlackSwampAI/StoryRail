import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  OPENROUTER_API_KEY_SLOT,
  STUDIOCMS_API_TOKEN_SLOT,
  WORDPRESS_APPLICATION_PASSWORD_SLOT,
  type SiteDestinationSettings,
  type SiteModelIds,
} from "@/domain/editorial";

import { SettingsWorkspace } from "./account-workspace";
import type { ModelCatalogClient } from "./model-catalog-client";
import type { SiteSettingsClient, SiteSettingsClientResult } from "./site-settings-client";

const MODELS: SiteModelIds = {
  evidencePreparation: "google/gemini-3.7-flash",
  assignmentEditor: "google/gemini-3.7-flash",
  writer: "google/gemini-3.7-flash",
  director: "google/gemini-3.7-flash",
  researcher: "google/gemini-3.7-flash",
};

const OPENROUTER_KEY = "sk-or-v1-0000000000000000abee";

const CATALOG: ModelCatalogClient = {
  readCatalog: () =>
    Promise.resolve({
      kind: "loaded",
      models: [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Anthropic: Claude Sonnet 4",
          contextLength: 200000,
        },
        { id: "google/gemini-3.7-flash", name: "Google: Gemini 3.7 Flash", contextLength: 1000000 },
      ],
    }),
};

function completed<Value>(value: Value): SiteSettingsClientResult<Value> {
  return { kind: "completed", value };
}

function client(overrides: Partial<SiteSettingsClient> = {}): SiteSettingsClient {
  return {
    readSettings: () =>
      Promise.resolve(
        completed({ settings: { models: MODELS, destination: null }, credentials: [] }),
      ),
    saveModels: (models) => Promise.resolve(completed({ models, destination: null })),
    saveDestination: (models, destination) => Promise.resolve(completed({ models, destination })),
    setCredential: (slot, secret) => Promise.resolve(completed({ slot, hint: secret.slice(-4) })),
    removeCredential: (slot) => Promise.resolve(completed(slot)),
    ...overrides,
  };
}

function renderSettings(requests: SiteSettingsClient, catalog: ModelCatalogClient = CATALOG) {
  render(
    <SettingsWorkspace
      theme="newsroom"
      onThemeChange={vi.fn()}
      requests={requests}
      catalog={catalog}
    />,
  );
}

/** Both stored connectors offer the same controls, so every assertion names the row it means. */
async function openRouterRow(): Promise<HTMLElement> {
  const input = await screen.findByLabelText("OpenRouter API key");
  return input.closest("li") as HTMLElement;
}

describe("settings workspace", () => {
  it("reads a connector with no stored credential as not connected", async () => {
    renderSettings(client());

    const row = within(await openRouterRow());
    expect(row.getByText("No key stored")).toBeVisible();
    expect(row.getByText("Not connected")).toBeVisible();
    expect(screen.queryByText(/Key configured · routes to many providers/)).toBeNull();
  });

  it("shows the returned hint after a key is entered and renders the key nowhere", async () => {
    const setCredential = vi.fn(client().setCredential);
    renderSettings(client({ setCredential }));

    const row = within(await openRouterRow());
    const input = row.getByLabelText("OpenRouter API key");
    fireEvent.change(input, { target: { value: OPENROUTER_KEY } });
    fireEvent.click(row.getByRole("button", { name: "Save key" }));

    expect(await row.findByText("Configured · ending abee")).toBeVisible();
    expect(setCredential).toHaveBeenCalledWith(OPENROUTER_API_KEY_SLOT, OPENROUTER_KEY);
    expect(document.body.textContent).not.toContain(OPENROUTER_KEY);
    expect(document.body.innerHTML).not.toContain(OPENROUTER_KEY);
  });

  it("leaves the credential field empty after a successful write", async () => {
    renderSettings(client());

    const row = within(await openRouterRow());
    const input = row.getByLabelText("OpenRouter API key");
    fireEvent.change(input, { target: { value: OPENROUTER_KEY } });
    fireEvent.click(row.getByRole("button", { name: "Save key" }));

    await row.findByText("Configured · ending abee");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
  });

  it("asks before removing a credential and deletes only once the operator confirms", async () => {
    const removeCredential = vi.fn(client().removeCredential);
    renderSettings(
      client({
        removeCredential,
        readSettings: () =>
          Promise.resolve(
            completed({
              settings: { models: MODELS, destination: null },
              credentials: [
                {
                  slot: OPENROUTER_API_KEY_SLOT,
                  hint: "abee",
                  updatedAt: "2026-08-23T19:36:17.426Z",
                },
              ],
            }),
          ),
      }),
    );

    const row = within(await openRouterRow());
    fireEvent.click(row.getByRole("button", { name: "Remove" }));
    expect(removeCredential).not.toHaveBeenCalled();

    const confirmation = within(row.getByRole("group", { name: "Remove OpenRouter key" }));
    fireEvent.click(confirmation.getByRole("button", { name: "Keep it" }));
    expect(removeCredential).not.toHaveBeenCalled();

    fireEvent.click(row.getByRole("button", { name: "Remove" }));
    fireEvent.click(row.getByRole("button", { name: "Remove OpenRouter key" }));

    await waitFor(() => expect(removeCredential).toHaveBeenCalledWith(OPENROUTER_API_KEY_SLOT));
    expect(await row.findByText("No key stored")).toBeVisible();
  });

  it("round-trips the five agent model ids through the store", async () => {
    const saveModels = vi.fn(client().saveModels);
    renderSettings(client({ saveModels }));

    const director = await screen.findByLabelText("Director");
    await waitFor(() =>
      expect(within(director as HTMLSelectElement).getAllByRole("option")).toHaveLength(2),
    );
    fireEvent.change(director, { target: { value: "anthropic/claude-sonnet-4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save agent models" }));

    await waitFor(() =>
      expect(saveModels).toHaveBeenCalledWith({
        ...MODELS,
        director: "anthropic/claude-sonnet-4",
      }),
    );
    expect(await screen.findByText("Agent models saved.")).toBeVisible();
    expect(screen.getByLabelText("Director")).toHaveValue("anthropic/claude-sonnet-4");
    expect(screen.getByLabelText("Researcher")).toHaveValue(MODELS.researcher);
  });

  it("says a stored key cannot be read differently from a key nobody entered", async () => {
    const unreadable = client({
      saveModels: () =>
        Promise.resolve({
          kind: "credential-unavailable",
          error: {
            code: "OPENROUTER_API_KEY_REQUIRED",
            reason: "CREDENTIAL_UNREADABLE",
            slot: OPENROUTER_API_KEY_SLOT,
            message: "unused",
          },
        }),
    });
    const { unmount } = render(
      <SettingsWorkspace
        theme="newsroom"
        onThemeChange={vi.fn()}
        requests={unreadable}
        catalog={CATALOG}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save agent models" }));
    const unreadableMessage = (await screen.findByText(/cannot be read/)).textContent;
    unmount();

    const missing = client({
      saveModels: () =>
        Promise.resolve({
          kind: "credential-unavailable",
          error: {
            code: "OPENROUTER_API_KEY_REQUIRED",
            reason: "CREDENTIAL_NOT_CONFIGURED",
            slot: OPENROUTER_API_KEY_SLOT,
            message: "unused",
          },
        }),
    });
    render(
      <SettingsWorkspace
        theme="newsroom"
        onThemeChange={vi.fn()}
        requests={missing}
        catalog={CATALOG}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save agent models" }));
    const missingMessage = (await screen.findByText(/No key is stored/)).textContent;

    expect(missingMessage).not.toEqual(unreadableMessage);
    expect(missingMessage).toMatch(/Enter one/);
  });

  it("leaves the previous state intact when a write fails and says what failed", async () => {
    renderSettings(
      client({
        setCredential: () =>
          Promise.resolve({
            kind: "application-failure",
            error: {
              code: "CREDENTIAL_KEY_UNAVAILABLE",
              message: "STORYRAIL_CREDENTIAL_KEY is required before a credential can be stored.",
            },
          }),
      }),
    );

    const row = within(await openRouterRow());
    fireEvent.change(row.getByLabelText("OpenRouter API key"), {
      target: { value: OPENROUTER_KEY },
    });
    fireEvent.click(row.getByRole("button", { name: "Save key" }));

    expect(await row.findByText(/STORYRAIL_CREDENTIAL_KEY is required/)).toBeVisible();
    expect(row.getByText("No key stored")).toBeVisible();
    expect(document.body.textContent).not.toContain(OPENROUTER_KEY);
  });

  it("offers every compatible model as a choice rather than a slug to type", async () => {
    renderSettings(client());

    const director = await screen.findByLabelText("Director");
    await waitFor(() =>
      expect(
        within(director).getByRole("option", { name: /Anthropic: Claude Sonnet 4/ }),
      ).toBeVisible(),
    );
    expect(director.tagName).toBe("SELECT");
    expect(
      within(director).getByRole("option", { name: /Google: Gemini 3.7 Flash/ }),
    ).toHaveTextContent("1M context");
    expect(screen.getByLabelText("Model provider")).toHaveValue("openrouter");
  });

  it("keeps showing a stored slug the catalog no longer lists and marks it unrecognised", async () => {
    const saveModels = vi.fn(client().saveModels);
    renderSettings(
      client({
        saveModels,
        readSettings: () =>
          Promise.resolve(
            completed({
              settings: {
                models: { ...MODELS, writer: "vendor/retired-model" },
                destination: null,
              },
              credentials: [],
            }),
          ),
      }),
    );

    const writer = await screen.findByLabelText("Writer");
    await waitFor(() => expect(writer).toHaveValue("vendor/retired-model"));
    expect(screen.getByText(/vendor\/retired-model is not in the catalog/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save agent models" }));
    await waitFor(() =>
      expect(saveModels).toHaveBeenCalledWith({ ...MODELS, writer: "vendor/retired-model" }),
    );
  });

  it("says the catalog is unavailable, keeps the current models, and still saves", async () => {
    const saveModels = vi.fn(client().saveModels);
    renderSettings(client({ saveModels }), {
      readCatalog: () =>
        Promise.resolve({ kind: "unavailable", message: "The model catalog is unavailable." }),
    });

    expect(await screen.findByText("The model catalog is unavailable.")).toBeVisible();
    expect(await screen.findByLabelText("Director")).toHaveValue(MODELS.director);

    fireEvent.click(screen.getByRole("button", { name: "Save agent models" }));
    await waitFor(() => expect(saveModels).toHaveBeenCalledWith(MODELS));
  });

  it("offers typing a slug by hand only once the catalog cannot be read", async () => {
    const { unmount } = render(
      <SettingsWorkspace
        theme="newsroom"
        onThemeChange={vi.fn()}
        requests={client()}
        catalog={CATALOG}
      />,
    );
    expect(await screen.findByLabelText("Director")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Enter a model slug by hand" })).toBeNull();
    unmount();

    const saveModels = vi.fn(client().saveModels);
    render(
      <SettingsWorkspace
        theme="newsroom"
        onThemeChange={vi.fn()}
        requests={client({ saveModels })}
        catalog={{
          readCatalog: () =>
            Promise.resolve({ kind: "unavailable", message: "The model catalog is unavailable." }),
        }}
      />,
    );

    const escape = await screen.findByRole("button", { name: "Enter a model slug by hand" });
    fireEvent.click(escape);
    fireEvent.change(screen.getByLabelText("Director"), {
      target: { value: "vendor/hand-typed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save agent models" }));

    await waitFor(() =>
      expect(saveModels).toHaveBeenCalledWith({ ...MODELS, director: "vendor/hand-typed" }),
    );
  });

  it("says the stored settings could not be read rather than showing invented ones", async () => {
    renderSettings(
      client({
        readSettings: () =>
          Promise.resolve({
            kind: "unavailable",
            message: "The settings request could not be completed.",
          }),
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/stored settings could not be read/);
    expect(screen.getByText("The agent models could not be read.")).toBeVisible();
  });
});

const WORDPRESS_DESTINATION: SiteDestinationSettings = {
  kind: "wordpress",
  baseUrl: "https://blog.example.com",
  username: "editor",
  draft: true,
};

const STUDIOCMS_DESTINATION: SiteDestinationSettings = {
  kind: "studiocms",
  baseUrl: "https://blog.example.com/studiocms_api/rest/v1",
  package: "@studiocms/markdown-remark",
  draft: true,
};

function withDestination(
  destination: SiteDestinationSettings | null,
  overrides: Partial<SiteSettingsClient> = {},
): SiteSettingsClient {
  return client({
    readSettings: () =>
      Promise.resolve(
        completed({
          settings: { models: MODELS, destination },
          credentials: [
            {
              slot: STUDIOCMS_API_TOKEN_SLOT,
              hint: "9f21",
              updatedAt: "2026-08-24T10:00:00.000Z",
            },
            {
              slot: WORDPRESS_APPLICATION_PASSWORD_SLOT,
              hint: "wxyz",
              updatedAt: "2026-08-25T10:00:00.000Z",
            },
          ],
        }),
      ),
    ...overrides,
  });
}

function destinationsSection(): HTMLElement {
  return screen.getByRole("region", { name: "Publishing destinations" });
}

describe("publishing destination settings", () => {
  it("no longer claims publishing records a decision without delivering it", async () => {
    renderSettings(withDestination(null));
    await screen.findByLabelText("Base URL");

    const section = destinationsSection();
    expect(section).not.toHaveTextContent(/it does not deliver/);
    expect(section).not.toHaveTextContent(/Publish through the StudioCMS API/);
    expect(section).not.toHaveTextContent(/Publish through the WordPress REST API/);
    // Ghost and Webhook really are unbuilt, so they are the only rows still marked planned.
    expect(within(section).getAllByText("Planned")).toHaveLength(2);
  });

  it("shows the WordPress fields and none of the StudioCMS ones", async () => {
    renderSettings(withDestination(WORDPRESS_DESTINATION));

    expect(await screen.findByLabelText("Base URL")).toHaveValue("https://blog.example.com");
    expect(screen.getByLabelText("WordPress user")).toHaveValue("editor");
    expect(screen.queryByLabelText("Renderer package")).toBeNull();
    expect(destinationsSection()).toHaveTextContent(/StoryRail appends \/wp-json\/wp\/v2\/posts/);
  });

  it("shows the StudioCMS fields and asks for the API path in the base URL", async () => {
    renderSettings(withDestination(STUDIOCMS_DESTINATION));

    expect(await screen.findByLabelText("Renderer package")).toHaveValue(
      "@studiocms/markdown-remark",
    );
    expect(screen.queryByLabelText("WordPress user")).toBeNull();
    expect(destinationsSection()).toHaveTextContent(/Include the API path/);
  });

  it("stores a WordPress destination with a username and no renderer package", async () => {
    const saveDestination = vi.fn(client().saveDestination);
    renderSettings(withDestination(null, { saveDestination }));

    fireEvent.change(await screen.findByLabelText("Base URL"), {
      target: { value: "https://blog.example.com" },
    });
    fireEvent.change(screen.getByLabelText("WordPress user"), { target: { value: "editor" } });
    fireEvent.click(screen.getByRole("button", { name: "Save destination" }));

    await waitFor(() =>
      expect(saveDestination).toHaveBeenCalledWith(MODELS, WORDPRESS_DESTINATION),
    );
    expect(await screen.findByText("Destination saved.")).toBeVisible();
  });

  it("replaces a destination when the kind changes rather than merging the two shapes", async () => {
    const saveDestination = vi.fn(client().saveDestination);
    renderSettings(withDestination(WORDPRESS_DESTINATION, { saveDestination }));

    fireEvent.change(await screen.findByLabelText("Destination"), {
      target: { value: "studiocms" },
    });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: STUDIOCMS_DESTINATION.baseUrl },
    });
    fireEvent.change(screen.getByLabelText("Renderer package"), {
      target: { value: "@studiocms/markdown-remark" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save destination" }));

    await waitFor(() =>
      expect(saveDestination).toHaveBeenCalledWith(MODELS, STUDIOCMS_DESTINATION),
    );
  });

  it("keeps a WordPress base URL out of a StudioCMS submission while a kind is being tried", async () => {
    renderSettings(withDestination(WORDPRESS_DESTINATION));

    fireEvent.change(await screen.findByLabelText("Destination"), {
      target: { value: "studiocms" },
    });
    expect(screen.getByLabelText("Base URL")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "wordpress" } });
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://blog.example.com");
  });

  it("leaves both stored credentials alone when the kind changes", async () => {
    const setCredential = vi.fn(client().setCredential);
    const removeCredential = vi.fn(client().removeCredential);
    renderSettings(withDestination(WORDPRESS_DESTINATION, { setCredential, removeCredential }));

    fireEvent.change(await screen.findByLabelText("Destination"), {
      target: { value: "studiocms" },
    });

    const section = within(destinationsSection());
    expect(section.getByText(/Configured · ending 9f21/)).toBeVisible();
    expect(section.getByText(/Configured · ending wxyz/)).toBeVisible();
    expect(removeCredential).not.toHaveBeenCalled();
    expect(setCredential).not.toHaveBeenCalled();
  });

  it("clears the destination to null and says nothing is delivered until one is set", async () => {
    const saveDestination = vi.fn(() =>
      Promise.resolve(completed({ models: MODELS, destination: null })),
    );
    renderSettings(withDestination(WORDPRESS_DESTINATION, { saveDestination }));

    fireEvent.click(await screen.findByRole("button", { name: "Remove destination" }));
    const confirmation = within(screen.getByRole("group", { name: "Remove the destination" }));
    fireEvent.click(confirmation.getByRole("button", { name: "Remove destination" }));

    await waitFor(() => expect(saveDestination).toHaveBeenCalledWith(MODELS, null));
    expect(await screen.findByText(/no longer delivers it anywhere/)).toBeVisible();
  });

  it("refuses to save a destination with nothing in the base URL", async () => {
    const saveDestination = vi.fn(client().saveDestination);
    renderSettings(withDestination(null, { saveDestination }));

    fireEvent.click(await screen.findByRole("button", { name: "Save destination" }));

    expect(await screen.findByText("Enter the WordPress site URL.")).toBeVisible();
    expect(saveDestination).not.toHaveBeenCalled();
  });

  it("renders an entered application password nowhere, only the hint the store returns", async () => {
    const setCredential = vi.fn(client().setCredential);
    renderSettings(withDestination(WORDPRESS_DESTINATION, { setCredential }));

    const field = await screen.findByLabelText("WordPress application password");
    fireEvent.change(field, { target: { value: "abcd efgh ijkl mnop" } });
    fireEvent.click(
      within(field.closest("li") as HTMLElement).getByRole("button", { name: "Replace key" }),
    );

    await waitFor(() =>
      expect(setCredential).toHaveBeenCalledWith(
        WORDPRESS_APPLICATION_PASSWORD_SLOT,
        "abcd efgh ijkl mnop",
      ),
    );
    expect(document.body.textContent).not.toContain("abcd efgh ijkl mnop");
    expect(field).toHaveValue("");
    expect(await screen.findByText(/ending mnop/)).toBeVisible();
  });
});
