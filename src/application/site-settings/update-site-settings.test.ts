import { describe, expect, it } from "vitest";

import type { SiteSettings } from "@/domain/editorial";

import type { SiteSettingsRepository } from "./site-settings-repository";
import { createUpdateSiteSettings } from "./update-site-settings";

const MODELS = {
  evidencePreparation: "provider/one",
  assignmentEditor: "provider/two",
  writer: "provider/three",
  director: "provider/four",
  researcher: "provider/five",
};

const DESTINATION = {
  kind: "studiocms",
  baseUrl: "https://newsroom.test/studiocms_api/rest/v1",
  package: "studiocms/markdown",
  draft: true,
} as const;

function store(initial: SiteSettings | null) {
  let stored = initial;
  const settings: SiteSettingsRepository = {
    find: async () => stored,
    update: async (command) => {
      stored = command.settings;
    },
  };
  return { settings, read: () => stored };
}

describe("changing what a newsroom is configured with", () => {
  it("leaves the destination alone when a submission says nothing about it", async () => {
    // The settings screen has no destination field. Without this, choosing a model would quietly
    // take away the newsroom's ability to deliver anything.
    const { settings, read } = store({ models: MODELS, destination: DESTINATION });
    const update = createUpdateSiteSettings({ settings, now: () => "2026-08-24T00:00:00.000Z" });

    await update({ models: { ...MODELS, writer: "provider/six" } });

    expect(read()).toEqual({
      models: { ...MODELS, writer: "provider/six" },
      destination: DESTINATION,
    });
  });

  it("takes the destination away only when asked to in so many words", async () => {
    const { settings, read } = store({ models: MODELS, destination: DESTINATION });
    const update = createUpdateSiteSettings({ settings, now: () => "2026-08-24T00:00:00.000Z" });

    await update({ models: MODELS, destination: null });

    expect(read()).toEqual({ models: MODELS, destination: null });
  });

  it("stores nothing when the submitted settings are refused", async () => {
    const { settings, read } = store({ models: MODELS, destination: DESTINATION });
    const update = createUpdateSiteSettings({ settings, now: () => "2026-08-24T00:00:00.000Z" });

    await expect(update({ models: { ...MODELS, writer: "  " } })).resolves.toMatchObject({
      ok: false,
    });
    expect(read()).toEqual({ models: MODELS, destination: DESTINATION });
  });
});
