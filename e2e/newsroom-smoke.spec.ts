import { expect, test } from "@playwright/test";

const ACCEPTANCE_DOMAIN = "smoke.acceptance.storyrail.test";

test("opens an empty, staffed newsroom through the real Site runtime", async ({
  page,
  request,
}) => {
  const listed = await request.get("/api/sites", {
    headers: { Accept: "application/json" },
  });
  expect(listed.ok()).toBeTruthy();
  const listedBody = (await listed.json()) as {
    readonly ok: boolean;
    readonly sites: readonly { readonly id: string; readonly domain: string }[];
  };
  expect(listedBody.ok).toBe(true);

  let siteId = listedBody.sites.find(({ domain }) => domain === ACCEPTANCE_DOMAIN)?.id;
  if (!siteId) {
    const created = await request.post("/api/sites", {
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      data: {
        name: "Browser Acceptance Newsroom",
        domain: ACCEPTANCE_DOMAIN,
        description: "Stable Site for StoryRail browser acceptance tests.",
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = (await created.json()) as {
      readonly ok: boolean;
      readonly site: { readonly id: string; readonly domain: string };
    };
    expect(createdBody.ok).toBe(true);
    expect(createdBody.site.domain).toBe(ACCEPTANCE_DOMAIN);
    siteId = createdBody.site.id;
  }

  await page.goto(`/s/${encodeURIComponent(siteId)}`);

  await expect(page.getByRole("button", { name: "Intake, 0 stories" })).toBeVisible();
  await expect(page.getByText("Loading Stories…", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Choose a Story from the Desk" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "General Writer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Director" })).toBeVisible();

  await page.getByRole("button", { name: "Inbox" }).click();
  await expect(page.getByRole("heading", { name: "No Sources await triage" })).toBeVisible();
  await expect(page.getByText("The pending inbox is clear.")).toBeVisible();
});
