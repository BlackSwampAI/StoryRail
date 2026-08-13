import { describe, expect, it, vi } from "vitest";
import type { DirectorRuntime, StoryRuntime } from "@/runtime";
import { createRecordStoryReviewDecisionHttpHandler } from "./record-story-review-decision-handler";
import { createRunDirectorReviewHttpHandler } from "./run-director-review-handler";
import { createSubmitStoryReviewHttpHandler } from "./submit-story-review-handler";

const context = { params: Promise.resolve({ storyId: "story-38" }) };
const request = (body: unknown) =>
  new Request("http://storyrail.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("supervised review HTTP bodies", () => {
  it("requires an exact empty review-submission object", async () => {
    const getRuntime = vi.fn(() => ({}) as StoryRuntime);
    const response = await createSubmitStoryReviewHttpHandler({
      getRuntime,
      environment: { STORYRAIL_OPERATOR_ID: "operator-38" },
    })(request({ target: "in_review" }), context);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it("requires an exact empty Director-review object", async () => {
    const getRuntime = vi.fn(() => ({}) as DirectorRuntime);
    const response = await createRunDirectorReviewHttpHandler({
      getRuntime,
      environment: { STORYRAIL_OPERATOR_ID: "operator-38" },
    })(request({ run: true }), context);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it("requires exactly directorRunId, decision, and reason", async () => {
    const getRuntime = vi.fn(() => ({}) as StoryRuntime);
    const handler = createRecordStoryReviewDecisionHttpHandler({
      getRuntime,
      environment: { STORYRAIL_OPERATOR_ID: "operator-38" },
    });
    const response = await handler(
      request({
        directorRunId: "run",
        decision: "approve",
        reason: "Reason",
        targetState: "approved",
      }),
      context,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(getRuntime).not.toHaveBeenCalled();
  });
});
