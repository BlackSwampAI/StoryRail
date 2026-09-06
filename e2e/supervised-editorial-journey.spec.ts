import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { createPostgresSourceRepositories } from "@/adapters/source-persistence/postgres-source-repositories";
import { createPostgresStoryRepository } from "@/adapters/story-persistence/postgres-story-repository";
import { createPostgresStorySourceAttachmentRepository } from "@/adapters/story-source-persistence/postgres-story-source-attachment-repository";
import {
  attachSourceToStory,
  createStory,
  intakeUrlSource,
  operatorId,
  recordSourceExtraction,
  siteId,
  sourceExtractionId,
  sourceId,
  storyId,
} from "@/domain/editorial";

const databaseUrl = process.env.STORYRAIL_TEST_DATABASE_URL as string;
const WORKFLOW_COMPLETION_TIMEOUT = 30_000;

test("runs a supervised Story from evidence through WordPress delivery", async ({
  page,
  request,
}) => {
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
  const storyIdentity = storyId(`story-${unique}`);
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
    const story = createStory({
      storyId: storyIdentity,
      title: "Harbour service restoration",
      createdAt: "2026-09-06T10:02:00.000Z",
    });
    if (!story.ok) throw new Error("Acceptance Story fixture is invalid.");
    const attachment = attachSourceToStory({
      storyId: storyIdentity,
      sourceId: sourceIdentity,
      relevance: "Primary service restoration notice",
      attachedBy: actor,
      attachedAt: "2026-09-06T10:03:00.000Z",
    });
    if (!attachment.ok) throw new Error("Acceptance attachment fixture is invalid.");

    const sources = createPostgresSourceRepositories({ pool, siteId: siteIdentity });
    expect((await sources.sources.persist({ source: source.source })).ok).toBe(true);
    expect((await sources.extractions.append({ extraction: extraction.extraction })).ok).toBe(true);
    expect(
      (
        await createPostgresStoryRepository({ pool, siteId: siteIdentity }).persist({
          story: story.story,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createPostgresStorySourceAttachmentRepository({
          pool,
          siteId: siteIdentity,
        }).attach({ attachment: attachment.attachment })
      ).ok,
    ).toBe(true);
  } finally {
    await pool.end();
  }

  await page.goto(`/s/${encodeURIComponent(siteIdentity)}`);
  await page.getByRole("button", { name: /Harbour service restoration, Intake/ }).click();
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

  const inspected = await request.get(`${api}/stories/${encodeURIComponent(storyIdentity)}`);
  expect(inspected.ok()).toBeTruthy();
  const body = (await inspected.json()) as {
    inspection: {
      story: { state: string };
      article: { revisions: readonly unknown[] };
      reviewDecisions: readonly { decision: string }[];
      agentRuns: readonly { role: string; operation: string; outcome: string }[];
      deliveries: readonly unknown[];
    };
  };
  expect(body.inspection.story.state).toBe("published");
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
  expect(body.inspection.deliveries).toEqual([
    expect.objectContaining({ outcome: "succeeded", remoteId: "412", destination: "wordpress" }),
  ]);
});
