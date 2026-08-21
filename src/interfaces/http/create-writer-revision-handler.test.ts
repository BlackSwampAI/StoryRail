import { describe, expect, it, vi } from "vitest";
import { createWriterRevisionHttpHandler } from "./create-writer-revision-handler";

describe("Writer revision HTTP handler", () => {
  const context = { params: Promise.resolve({ storyId: "story-41" }) };

  it("requires an exact empty JSON object", async () => {
    const getRuntime = vi.fn();
    const response = await createWriterRevisionHttpHandler({
      getRuntime,
      environment: { STORYRAIL_OPERATOR_ID: "operator" },
    })(
      new Request("http://test/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: "spoof" }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it("accepts a started run and returns its identity without waiting for the model", async () => {
    const run = {
      id: "run",
      storyId: "story-41",
      profileId: "writer",
      role: "writer",
      operation: "article_revision",
      outcome: "failed",
    };
    const runtime = {
      createWriterDraft: vi.fn(),
      createWriterRevision: vi.fn(async () => ({
        ok: true as const,
        runId: run.id,
        completion: Promise.resolve({ ok: true as const, run }),
      })),
      close: vi.fn(),
    };
    const scheduled: (() => Promise<void>)[] = [];
    const response = await createWriterRevisionHttpHandler({
      getRuntime: () => runtime as never,
      environment: { STORYRAIL_OPERATOR_ID: "operator" },
      after: (task) => scheduled.push(task),
    })(
      new Request("http://test/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      context,
    );

    // The response is produced while the model call is still outstanding.
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, runId: run.id });
    expect(scheduled).toHaveLength(1);
    await Promise.all(scheduled.map((task) => task()));
  });
});
