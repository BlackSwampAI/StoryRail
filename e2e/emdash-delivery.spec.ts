import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { createAcceptanceSite, configureAcceptanceProviders } from "./support/acceptance-site";

test("runs a Story through the newsroom and delivers a Portable Text post to EmDash", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const site = await createAcceptanceSite(request, "emdash-delivery");
  await configureAcceptanceProviders(request, site);
  const models = {
    evidencePreparation: "openai/gpt-4o-mini",
    assignmentEditor: "openai/gpt-4o-mini",
    writer: "openai/gpt-4o-mini",
    director: "openai/gpt-4o-mini",
    researcher: "openai/gpt-4o-mini",
  };
  const configured = await request.put(`${site.api}/site-settings`, {
    data: {
      models,
      destination: {
        kind: "emdash",
        baseUrl: "http://127.0.0.1:3135/_emdash/api",
        collection: "posts",
        draft: false,
      },
    },
  });
  expect(configured.ok()).toBeTruthy();
  const credential = await request.put(`${site.api}/site-credentials/emdash_api_token`, {
    data: { secret: "acceptance-emdash-token" },
  });
  expect(credential.ok()).toBeTruthy();
  await page.goto(`/s/${encodeURIComponent(site.id)}`);
  await expect(page.getByRole("button", { name: "Intake, 0 stories" })).toBeVisible();
  await page.getByRole("button", { name: "Add Source" }).click();
  await page
    .getByRole("textbox", { name: "Source URL" })
    .fill(`https://${site.domain}/harbour-notice`);
  await page.getByRole("checkbox", { name: /Run this all the way to a published post/ }).check();
  await page
    .getByLabel("Why does this matter to your readers?")
    .fill("Residents should know that harbour service returned.");
  await page
    .getByLabel("Anything you want us to investigate or emphasize?")
    .fill("Confirm that service has returned.");
  await page.getByRole("checkbox", { name: /Look for more Sources first/ }).check();
  await page.getByRole("button", { name: "Start Autopilot" }).click();

  const published = page.getByRole("heading", { name: "This Story is published" });
  await expect(published).toBeVisible({ timeout: 180_000 });
  await expect(published.locator("..")).toContainText("Delivered to emdash as emdash-item-1", {
    timeout: 180_000,
  });

  const database = new Pool({ connectionString: process.env.STORYRAIL_TEST_DATABASE_URL });
  try {
    await expect(
      database.query(
        `SELECT delivery.outcome, delivery.destination, delivery.remote_id
         FROM storyrail.story_deliveries AS delivery
         JOIN storyrail.stories AS story USING (story_id)
         WHERE story.site_id = $1 AND delivery.remote_id = $2`,
        [site.id, "emdash-item-1"],
      ),
    ).resolves.toMatchObject({
      rows: [{ outcome: "succeeded", destination: "emdash", remote_id: "emdash-item-1" }],
    });
  } finally {
    await database.end();
  }
});
