import { randomUUID } from "node:crypto";

import { expect, test, type TestInfo } from "@playwright/test";
import { Pool } from "pg";

import { createPostgresSourceRepositories } from "@/adapters/source-persistence/postgres-source-repositories";
import {
  intakeUrlSource,
  operatorId,
  recordSourceExtraction,
  siteId,
  sourceExtractionId,
  sourceId,
} from "@/domain/editorial";

const databaseUrl = process.env.STORYRAIL_TEST_DATABASE_URL as string;
const WORKFLOW_COMPLETION_TIMEOUT = 30_000;
const PUBLICATION_BRIEF = {
  audience: "Harbour district residents",
  readerBenefit: "Know what changed and what to do next.",
  coverageCriteria: "Local services and their effects on residents.",
  voice: "Direct and calm.",
  avoid: "Speculation about causes.",
};

test("sets up the brief, covers a Source, edits Story purpose, and delivers under manual control", async ({
  page,
  request,
}, testInfo: TestInfo) => {
  test.setTimeout(150_000);
  const unique = randomUUID();
  const domain = `journey-${unique}.acceptance.storyrail.test`;
  const created = await request.post("/api/sites", {
    data: {
      name: "Supervised Journey Newsroom",
      domain,
      description: "Isolated newsroom for the supervised editorial acceptance journey.",
    },
  });
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as { site: { id: string } };
  const siteIdentity = siteId(createdBody.site.id);
  const api = `/api/sites/${encodeURIComponent(siteIdentity)}`;
  const models = {
    evidencePreparation: "openai/gpt-4o-mini",
    assignmentEditor: "openai/gpt-4o-mini",
    writer: "openai/gpt-4o-mini",
    director: "openai/gpt-4o-mini",
    researcher: "openai/gpt-4o-mini",
  };

  const settings = await request.put(`${api}/site-settings`, {
    data: {
      models,
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
    ["wordpress_application_password", "acceptance-wordpress-password"],
  ] as const) {
    const stored = await request.put(`${api}/site-credentials/${slot}`, { data: { secret } });
    expect(stored.ok()).toBeTruthy();
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const actor = { type: "operator" as const, operatorId: operatorId("acceptance-operator") };
  const sourceIdentity = sourceId(`source-${unique}`);
  const extractionIdentity = sourceExtractionId(`extraction-${unique}`);
  try {
    const source = intakeUrlSource(
      {
        sourceId: sourceIdentity,
        submittedUrl: `https://${domain}/harbour-notice`,
        submittedBy: actor,
        receivedAt: "2026-09-06T10:00:00.000Z",
      },
      [],
    );
    if (!source.ok) throw new Error("Acceptance Source fixture is invalid.");
    const extraction = recordSourceExtraction({
      extractionId: extractionIdentity,
      source: source.source,
      extractor: { key: "acceptance", version: "1" },
      requestedBy: actor,
      startedAt: "2026-09-06T10:01:00.000Z",
      completedAt: "2026-09-06T10:01:01.000Z",
      outcome: "succeeded",
      document: {
        format: "markdown",
        content: "Harbour service was restored Monday.",
        title: "Harbour service notice",
        byline: null,
        publishedAt: null,
        language: "en",
      },
    });
    if (!extraction.ok) throw new Error("Acceptance extraction fixture is invalid.");
    const sources = createPostgresSourceRepositories({ pool, siteId: siteIdentity });
    expect((await sources.sources.persist({ source: source.source })).ok).toBe(true);
    expect((await sources.extractions.append({ extraction: extraction.extraction })).ok).toBe(true);
  } finally {
    await pool.end();
  }

  await page.goto(`/s/${encodeURIComponent(siteIdentity)}`);
  await expect(page.getByRole("button", { name: "Inbox" })).toBeVisible();
  await page.getByRole("button", { name: "Newsroom brief" }).click();
  await page.getByLabel("Who do you write for?").fill(PUBLICATION_BRIEF.audience);
  await page
    .getByLabel("What do you help them understand or do?")
    .fill(PUBLICATION_BRIEF.readerBenefit);
  await page
    .getByLabel("What makes a story worth covering?")
    .fill(PUBLICATION_BRIEF.coverageCriteria);
  await page.getByLabel("How should your articles sound?").fill(PUBLICATION_BRIEF.voice);
  await page.getByLabel("What should writers avoid?").fill(PUBLICATION_BRIEF.avoid);
  const savedBriefResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`${api}/newsroom-standards`),
  );
  await page.getByRole("button", { name: "Save newsroom brief" }).click();
  await expect(
    page.getByText("Saved newsroom brief as revision 1", { exact: false }),
  ).toBeVisible();
  const briefRevision = (
    (await (await savedBriefResponse).json()) as {
      standards: {
        revisionNumber: number;
        text: string;
        brief: typeof PUBLICATION_BRIEF;
        id: string;
        updatedAt: string;
        updatedBy: { type: string; operatorId: string };
      };
    }
  ).standards;
  await page.getByLabel("Who do you write for?").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("manual-newsroom-brief-desktop-top.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save newsroom brief" }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("manual-newsroom-brief-desktop-bottom.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-layout="stacked"]')).toBeVisible();
  // The desk has a separate mobile layout; re-enter the editor after its breakpoint remount.
  await page.getByRole("button", { name: "Newsroom brief" }).click();
  await expect(page.getByLabel("Who do you write for?")).toHaveValue(PUBLICATION_BRIEF.audience);
  await page.getByLabel("Who do you write for?").scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("manual-newsroom-brief-narrow.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator("#storyrail-newsroom-layout")).toBeVisible();

  // Revisit the saved revision, edit one answer, and make a new revision without rewriting history.
  await page.getByRole("button", { name: "Inbox" }).click();
  await page.getByRole("button", { name: "Newsroom brief" }).click();
  await expect(page.getByLabel("What do you help them understand or do?")).toHaveValue(
    PUBLICATION_BRIEF.readerBenefit,
  );
  await page
    .getByLabel("What do you help them understand or do?")
    .fill("Know what changed and how to respond.");
  const updatedBriefResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`${api}/newsroom-standards`),
  );
  await page.getByRole("button", { name: "Save newsroom brief" }).click();
  await expect(
    page.getByText("Saved newsroom brief as revision 2", { exact: false }),
  ).toBeVisible();
  const secondBriefRevision = (
    (await (await updatedBriefResponse).json()) as {
      standards: {
        revisionNumber: number;
        text: string;
        brief: typeof PUBLICATION_BRIEF;
        id: string;
        updatedAt: string;
        updatedBy: { type: string; operatorId: string };
      };
    }
  ).standards;
  expect(secondBriefRevision.revisionNumber).toBe(2);
  expect(secondBriefRevision.brief.readerBenefit).toBe("Know what changed and how to respond.");
  const standardsHistory = await request.get(`${api}/newsroom-standards`);
  expect(await standardsHistory.json()).toMatchObject({
    standards: [briefRevision, secondBriefRevision],
  });

  await page.getByRole("button", { name: "Inbox" }).click();
  await expect(page.getByRole("heading", { name: "Harbour service notice" })).toBeVisible();
  await page.getByRole("button", { name: "Cover this" }).click();
  await page.getByLabel("Story title").fill("Harbour service restoration");
  await page
    .getByLabel("Why does this matter to your readers?")
    .fill("Residents need to know service is restored and when to use it.");
  await page
    .getByLabel("Anything you want us to investigate or emphasize?")
    .fill("Confirm restoration timing.");
  await page.getByLabel("Story title").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("manual-source-triage-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-layout="stacked"]')).toBeVisible();
  // The desktop and mobile desk layouts remount their workspaces at the breakpoint, so reopen
  // the intake form and enter the values in this viewport before checking or capturing it.
  await page.getByRole("button", { name: "Cover this" }).click();
  await page.getByLabel("Story title").fill("Harbour service restoration");
  await page
    .getByLabel("Why does this matter to your readers?")
    .fill("Residents need to know service is restored and when to use it.");
  await page
    .getByLabel("Anything you want us to investigate or emphasize?")
    .fill("Confirm restoration timing.");
  await page.getByLabel("Story title").scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  for (const label of [
    "Story title",
    "Why does this matter to your readers?",
    "Anything you want us to investigate or emphasize?",
  ]) {
    const bounds = await page.getByLabel(label).boundingBox();
    expect(bounds, `${label} should be visible in the narrow viewport`).not.toBeNull();
    expect(bounds!.x, `${label} should not be clipped on the left`).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width, `${label} should fit inside 390px`).toBeLessThanOrEqual(390);
  }
  const sourceTitleBounds = await page
    .getByRole("heading", { name: "Harbour service notice" })
    .boundingBox();
  expect(sourceTitleBounds).not.toBeNull();
  expect(sourceTitleBounds!.x + sourceTitleBounds!.width).toBeLessThanOrEqual(390);
  const formBounds = await page
    .locator("form")
    .filter({ has: page.getByLabel("Story title") })
    .boundingBox();
  expect(formBounds).not.toBeNull();
  expect(formBounds!.x).toBeGreaterThanOrEqual(0);
  expect(formBounds!.x + formBounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("manual-source-triage-narrow.png"),
    fullPage: true,
  });
  const createStoryResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().endsWith(`${api}/stories`),
  );
  await page.getByRole("button", { name: "Cover this Source" }).click();
  const storyId = ((await (await createStoryResponse).json()) as { story: { id: string } }).story
    .id;
  await expect(page.getByRole("button", { name: "Open Story" })).toBeVisible();
  await page.getByRole("button", { name: "Open Story" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator("#storyrail-newsroom-layout")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What this Story should do for readers" }),
  ).toBeVisible();
  await page.getByLabel("Why does this matter to your readers?").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("manual-story-purpose-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-layout="stacked"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Harbour service restoration, Intake/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Harbour service restoration, Intake/ }).click();
  await expect(
    page.getByRole("heading", { name: "What this Story should do for readers" }),
  ).toBeVisible();
  await page.getByLabel("Why does this matter to your readers?").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("manual-story-purpose-narrow.png"),
    fullPage: true,
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator("#storyrail-newsroom-layout")).toBeVisible();
  await page.getByRole("button", { name: /Harbour service restoration, Intake/ }).click();
  await expect(
    page.getByRole("heading", { name: "What this Story should do for readers" }),
  ).toBeVisible();
  await page
    .getByLabel("Why does this matter to your readers?")
    .fill("Residents need to know service is back and how that affects their commute.");
  await page.getByRole("button", { name: "Save reader purpose" }).click();
  await expect(
    page.getByText("Reader purpose saved for this Story.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Who do you write for?")).toHaveCount(0);
  await page.getByRole("button", { name: "Write the Assignment myself" }).click();
  await page
    .getByRole("textbox", { name: "Angle", exact: true })
    .fill("Report the verified restoration of harbour service.");
  await page
    .getByRole("textbox", { name: "Brief", exact: true })
    .fill("State what the notice verifies and do not speculate.");
  await page
    .getByRole("textbox", { name: "Why this Writer and this angle", exact: true })
    .fill("The general Writer can turn the attached notice into a concise update.");
  await page.getByRole("button", { name: "Assign it and write the draft" }).click();
  await expect(page.getByRole("heading", { name: "Harbour service update" })).toBeVisible({
    timeout: WORKFLOW_COMPLETION_TIMEOUT,
  });

  await page.getByRole("button", { name: "Send this draft to the Director" }).click();
  await page.getByRole("button", { name: "Ask the Director to read it" }).click();
  await expect(page.getByRole("heading", { name: "The Director recommends changes" })).toBeVisible({
    timeout: WORKFLOW_COMPLETION_TIMEOUT,
  });
  await page.getByLabel("Your reason").fill("The Director identified a clearer lead.");
  await page.getByRole("button", { name: "Send it back to the Writer" }).click();
  await page.getByRole("button", { name: "Write revision 2" }).click();
  await expect(
    page.getByRole("heading", { name: "Verified harbour service restored" }),
  ).toBeVisible({ timeout: WORKFLOW_COMPLETION_TIMEOUT });

  await page.getByRole("button", { name: "Send this draft to the Director" }).click();
  await page.getByRole("button", { name: "Ask the Director to read it" }).click();
  await expect(
    page.getByRole("heading", { name: "The Director recommends approving it" }),
  ).toBeVisible({ timeout: WORKFLOW_COMPLETION_TIMEOUT });
  await page.getByLabel("Your reason").fill("The revision is supported and ready.");
  await page.getByRole("button", { name: "Approve this draft" }).click();
  await expect(page.getByRole("heading", { name: "Approved and ready to publish" })).toBeVisible({
    timeout: WORKFLOW_COMPLETION_TIMEOUT,
  });
  await page.getByRole("button", { name: "Publish this Story" }).click();
  await page
    .getByLabel("Why this Story is being published")
    .fill("Checked against the attached notice and approved.");
  await page.getByRole("button", { name: "Publish this Story" }).click();
  await expect(page.getByRole("heading", { name: "This Story is published" })).toBeVisible({
    timeout: WORKFLOW_COMPLETION_TIMEOUT,
  });
  await page.getByRole("button", { name: "Deliver to the current destination" }).click();
  await page.getByRole("button", { name: "Deliver to the current destination now" }).click();
  await expect(page.getByText("Delivered to wordpress.", { exact: true })).toBeVisible({
    timeout: WORKFLOW_COMPLETION_TIMEOUT,
  });
  await expect(
    page.getByRole("heading", { name: "This Story is published" }).locator(".."),
  ).toContainText("Delivered to wordpress as 412", { timeout: WORKFLOW_COMPLETION_TIMEOUT });

  const inspected = await request.get(`${api}/stories/${encodeURIComponent(storyId)}`);
  expect(inspected.ok()).toBeTruthy();
  const body = (await inspected.json()) as {
    inspection: {
      story: { state: string; purpose?: { readerValue: string; focus: string } };
      article: { revisions: readonly unknown[] };
      reviewDecisions: readonly { decision: string }[];
      agentRuns: readonly {
        role: string;
        operation: string;
        outcome: string;
        input: { editorialContext?: unknown };
      }[];
      deliveries: readonly unknown[];
    };
  };
  expect(body.inspection.story.state).toBe("published");
  expect(body.inspection.story.purpose).toEqual({
    readerValue: "Residents need to know service is back and how that affects their commute.",
    focus: "Confirm restoration timing.",
  });
  expect(body.inspection.article.revisions).toHaveLength(2);
  expect(body.inspection.reviewDecisions.map(({ decision }) => decision)).toEqual([
    "request_changes",
    "approve",
  ]);
  expect(
    body.inspection.agentRuns
      .filter(({ outcome }) => outcome === "succeeded")
      .map(({ role, operation }) => ({ role, operation })),
  ).toEqual([
    { role: "writer", operation: "article_draft" },
    { role: "editor_in_chief", operation: "article_review" },
    { role: "writer", operation: "article_revision" },
    { role: "editor_in_chief", operation: "article_review" },
  ]);
  for (const run of body.inspection.agentRuns.filter(({ outcome }) => outcome === "succeeded")) {
    expect(run.input.editorialContext).toEqual({
      identity: {
        name: "Supervised Journey Newsroom",
        description: "Isolated newsroom for the supervised editorial acceptance journey.",
      },
      standards: secondBriefRevision,
    });
  }
  expect(body.inspection.deliveries).toEqual([
    expect.objectContaining({ outcome: "succeeded", remoteId: "412", destination: "wordpress" }),
  ]);
});
