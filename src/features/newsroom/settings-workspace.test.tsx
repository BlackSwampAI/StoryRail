import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OPENROUTER_API_KEY_SLOT, type SiteModelIds } from "@/domain/editorial";

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
      Promise.resolve(completed({ settings: { models: MODELS }, credentials: [] })),
    saveModels: (models) => Promise.resolve(completed({ models })),
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
              settings: { models: MODELS },
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
              settings: { models: { ...MODELS, writer: "vendor/retired-model" } },
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
