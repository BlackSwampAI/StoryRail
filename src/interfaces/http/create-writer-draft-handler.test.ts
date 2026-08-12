import { describe, expect, it, vi } from "vitest";
import { createWriterDraftHttpHandler } from "./create-writer-draft-handler";

describe("Writer draft HTTP handler", () => {
  const context = { params: Promise.resolve({ storyId: "story-31" }) };
  it("requires an exact empty JSON object", async () => {
    const getRuntime = vi.fn();
    const response = await createWriterDraftHttpHandler({
      getRuntime,
      environment: { STORYRAIL_OPERATOR_ID: "operator" },
    })(
      new Request("http://test/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "spoof" }),
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getRuntime).not.toHaveBeenCalled();
  });
  it("returns a durable failed run as a completed execution record", async () => {
    const run = {
      id: "run",
      storyId: "story-31",
      profileId: "writer",
      role: "writer",
      operation: "article_draft",
      outcome: "failed",
    };
    const runtime = {
      createWriterDraft: vi.fn(async () => ({ ok: true as const, run })),
      close: vi.fn(),
    };
    const response = await createWriterDraftHttpHandler({
      getRuntime: () => runtime as never,
      environment: { STORYRAIL_OPERATOR_ID: "operator" },
    })(
      new Request("http://test/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      context,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true, run: { outcome: "failed" } });
  });
});
