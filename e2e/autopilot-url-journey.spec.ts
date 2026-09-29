import { expect, test } from "@playwright/test";

import { createAcceptanceSite, configureAcceptanceProviders } from "./support/acceptance-site";

const AUTOPILOT_COMPLETION_TIMEOUT = 120_000;
const AUTOPILOT_REVIEW_DECISION_REASON = "Adopted the Director recommendation under autopilot.";
const AUTOPILOT_SOURCE_RELEVANCE =
  "Autopilot attached the page this run was started from. No operator has judged its relevance.";

interface ObservedPolicyRun {
  readonly status: string;
  readonly conclusion?: string;
  readonly reason?: string;
  readonly policy: string;
  readonly research: boolean;
  readonly step: string;
  readonly storyId: string | null;
  readonly sourceId: string | null;
  readonly requestedBy: { readonly type: string; readonly operatorId: string };
}

test("runs a URL to a delivered WordPress post through the newsroom UI under autopilot", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const site = await createAcceptanceSite(request, "autopilot");
  await configureAcceptanceProviders(request, site);
  const submittedUrl = `https://${site.domain}/harbour-notice`;

  // The operator opens the newsroom and chooses to add a Source.
  await page.goto(`/s/${encodeURIComponent(site.id)}`);
  await expect(page.getByRole("button", { name: "Intake, 0 stories" })).toBeVisible();
  await expect(page.getByText("Loading Stories…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add Source" }).click();
  await expect(page.getByRole("heading", { name: "Add a Source to the newsroom" })).toBeVisible();

  // The operator authorizes autopilot for this URL and submits it.
  await page.getByRole("textbox", { name: "Source URL" }).fill(submittedUrl);
  await page.getByRole("checkbox", { name: /Run this all the way to a published post/ }).check();
  await expect(
    page.getByRole("checkbox", { name: /Look for more Sources first/ }),
  ).not.toBeChecked();
  const autopilotResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().endsWith(`${site.api}/autopilot`),
  );
  await page.getByRole("button", { name: "Run this to a published post" }).click();

  // Intake is durable before the response, and everything after it is followed as progress.
  const started = await autopilotResponse;
  expect(started.status()).toBe(202);
  const startedBody = (await started.json()) as {
    ok: boolean;
    policyRunId: string;
    sourceId: string;
  };
  expect(startedBody.ok).toBe(true);
  expect(startedBody.policyRunId).toEqual(expect.any(String));
  expect(startedBody.sourceId).toEqual(expect.any(String));
  await expect(
    page.getByRole("heading", { name: "Running this to a published post…" }),
  ).toBeVisible();

  // The operator is handed to the Story and watches it reach publication and delivery unaided.
  const liveHeading = page.getByRole("heading", { name: "This Story is published" });
  await expect(liveHeading).toBeVisible({ timeout: AUTOPILOT_COMPLETION_TIMEOUT });
  await expect(liveHeading.locator("..")).toContainText("Delivered to wordpress as 412", {
    timeout: AUTOPILOT_COMPLETION_TIMEOUT,
  });

  // The whole sequence settles as one completed policy run.
  const readPolicyRun = async (): Promise<ObservedPolicyRun | null> => {
    const response = await request.get(`${site.api}/policy-runs/${startedBody.policyRunId}`);
    if (!response.ok()) return null;
    return ((await response.json()) as { run: ObservedPolicyRun }).run;
  };
  await expect
    .poll(async () => (await readPolicyRun())?.status ?? "unavailable", {
      timeout: AUTOPILOT_COMPLETION_TIMEOUT,
      intervals: [1_000],
    })
    .toBe("settled");
  const policyRun = await readPolicyRun();
  expect(policyRun).toMatchObject({
    policy: "autopilot",
    research: false,
    status: "settled",
    conclusion: "completed",
    reason: "The policy ran to delivery.",
    step: "delivery",
    sourceId: null,
    requestedBy: { type: "operator", operatorId: "acceptance-operator" },
  });
  const storyId = policyRun?.storyId;
  expect(storyId).toEqual(expect.any(String));

  // The durable record says what autopilot did, on behalf of the operator, and delivered it.
  const inspected = await request.get(`${site.api}/stories/${encodeURIComponent(storyId ?? "")}`);
  expect(inspected.ok()).toBeTruthy();
  const { inspection } = (await inspected.json()) as {
    inspection: {
      story: { title: string; state: string; revisionCycle: number };
      sources: readonly {
        source: { id: string };
        attachment: { relevance: string };
        preparations: readonly { outcome: string }[];
      }[];
      assignment: {
        assignment: { angle: string; assignedBy: { type: string; operatorId: string } };
        writerProfile: { name: string };
      } | null;
      article: { revisions: readonly unknown[] };
      reviewDecisions: readonly { decision: string; reason: string }[];
      agentRuns: readonly { role: string; operation: string; outcome: string }[];
      deliveries: readonly { outcome: string; remoteId: string; destination: string }[];
    };
  };
  expect(inspection.story.title).toBe("Harbour service notice");
  expect(inspection.story.state).toBe("published");
  expect(inspection.sources).toHaveLength(1);
  expect(inspection.sources[0]?.source.id).toBe(startedBody.sourceId);
  expect(inspection.sources[0]?.attachment.relevance).toBe(AUTOPILOT_SOURCE_RELEVANCE);
  expect(inspection.sources[0]?.preparations.map(({ outcome }) => outcome)).toEqual(["succeeded"]);
  expect(inspection.assignment).toMatchObject({
    assignment: {
      angle: "Report the verified restoration of harbour service.",
      assignedBy: { type: "operator", operatorId: "acceptance-operator" },
    },
  });
  expect(inspection.article.revisions).toHaveLength(2);
  expect(inspection.reviewDecisions).toEqual([
    expect.objectContaining({
      decision: "request_changes",
      reason: AUTOPILOT_REVIEW_DECISION_REASON,
    }),
    expect.objectContaining({ decision: "approve", reason: AUTOPILOT_REVIEW_DECISION_REASON }),
  ]);
  expect(
    inspection.agentRuns.map(({ role, operation, outcome }) => ({ role, operation, outcome })),
  ).toEqual([
    { role: "assignment_editor", operation: "assignment_proposal", outcome: "succeeded" },
    { role: "writer", operation: "article_draft", outcome: "succeeded" },
    { role: "editor_in_chief", operation: "article_review", outcome: "succeeded" },
    { role: "writer", operation: "article_revision", outcome: "succeeded" },
    { role: "editor_in_chief", operation: "article_review", outcome: "succeeded" },
  ]);
  expect(inspection.deliveries).toEqual([
    expect.objectContaining({ outcome: "succeeded", remoteId: "412", destination: "wordpress" }),
  ]);

  // A fresh page load shows the operator the end state: published and delivered.
  await page.reload();
  const publishedQueue = page.getByRole("button", { name: "Published, 1 story" });
  await expect(publishedQueue).toBeVisible();
  if ((await publishedQueue.getAttribute("aria-expanded")) !== "true") {
    await publishedQueue.click();
  }
  await page.getByRole("button", { name: /^Harbour service notice, Published, 1 source$/ }).click();
  const publishedHeading = page.getByRole("heading", { name: "This Story is published" });
  await expect(publishedHeading).toBeVisible();
  await expect(publishedHeading.locator("..")).toContainText("Delivered to wordpress as 412");
});
