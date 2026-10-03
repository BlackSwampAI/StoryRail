import { expect, test } from "@playwright/test";

import { createAcceptanceSite } from "./support/acceptance-site";

test("keeps the full Story rail visible above a changing workspace", async ({ page, request }) => {
  const site = await createAcceptanceSite(request, "rail-layout");
  const title =
    "How the harbor authority restored evening ferry service after a week of severe coastal weather";
  const created = await request.post(`${site.api}/stories`, { data: { title } });
  expect(created.status()).toBe(201);

  await page.setViewportSize({ width: 1050, height: 600 });
  await page.goto(`/s/${encodeURIComponent(site.id)}`);
  const storyCard = page.getByRole("button", { name: new RegExp(title) });
  await expect(storyCard).toBeVisible();
  await storyCard.click();

  const rail = page.getByRole("region", { name: "Story rail" });
  const titleHeading = page.getByRole("heading", { level: 1, name: title });
  const stops = rail.locator("ol > li");
  await expect(rail).toBeVisible();
  await expect(titleHeading).toBeVisible();
  await expect(stops).toHaveCount(7);

  const initialLayout = await page.evaluate(() => {
    const railElement = document.querySelector<HTMLElement>("#story-rail");
    const heading = document.querySelector<HTMLElement>("#workspace-story-title");
    const stopElements = [...document.querySelectorAll<HTMLElement>("#story-rail ol > li")];
    if (!railElement || !heading) throw new Error("Story workspace landmarks were not rendered.");
    return {
      railTop: railElement.getBoundingClientRect().top,
      headingTop: heading.getBoundingClientRect().top,
      stopTops: stopElements.map((stop) => stop.getBoundingClientRect().top),
      stopHeights: stopElements.map((stop) => stop.getBoundingClientRect().height),
      stopBounds: stopElements.map((stop) => {
        const rect = stop.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }),
    };
  });

  // The complete rail leads the variable-height title and remains close to the top of the view.
  expect(initialLayout.railTop).toBeGreaterThanOrEqual(52);
  expect(initialLayout.railTop).toBeLessThan(90);
  expect(initialLayout.railTop).toBeLessThan(initialLayout.headingTop);
  expect(initialLayout.headingTop - initialLayout.railTop).toBeLessThan(220);
  // At this workspace width all seven stops fit in the intended four-plus-three compact grid.
  expect(new Set(initialLayout.stopTops.map((top) => Math.round(top))).size).toBe(2);
  expect(initialLayout.stopTops.slice(0, 4).every((top) => top === initialLayout.stopTops[0])).toBe(
    true,
  );
  expect(initialLayout.stopTops.slice(4).every((top) => top === initialLayout.stopTops[4])).toBe(
    true,
  );
  expect(initialLayout.stopHeights.every((height) => height > 0)).toBe(true);
  expect(
    initialLayout.stopBounds.every(
      ({ left, right, top, bottom }) => left >= 0 && right <= 1050 && top >= 0 && bottom <= 600,
    ),
  ).toBe(true);

  const scroll = await page.evaluate(() => {
    const railElement = document.querySelector<HTMLElement>("#story-rail");
    if (!railElement) throw new Error("Story rail was not rendered.");
    let scroller = railElement.parentElement;
    while (scroller) {
      const { overflowY } = getComputedStyle(scroller);
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        scroller.scrollHeight > scroller.clientHeight
      ) {
        const available = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = Math.min(500, available);
        return { available, scrollTop: scroller.scrollTop };
      }
      scroller = scroller.parentElement;
    }
    throw new Error("Could not find a scrollable workspace ancestor for the Story rail.");
  });
  expect(scroll.available).toBeGreaterThanOrEqual(100);
  expect(scroll.scrollTop).toBeGreaterThanOrEqual(100);
  await expect
    .poll(() => rail.evaluate((element) => element.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(52);
  await expect
    .poll(() => rail.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThanOrEqual(64);
  await expect(stops).toHaveCount(7);
  for (const stop of [
    "Intake",
    "Assigned",
    "Drafting",
    "Review",
    "Approved",
    "Published",
    "Delivered",
  ]) {
    await expect(rail.getByText(stop, { exact: true })).toBeVisible();
  }
  const scrolledBounds = await stops.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }),
  );
  expect(
    scrolledBounds.every(
      ({ left, right, top, bottom }) => left >= 0 && right <= 1050 && top >= 0 && bottom <= 600,
    ),
  ).toBe(true);
});
