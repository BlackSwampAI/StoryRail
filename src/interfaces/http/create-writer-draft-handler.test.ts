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
  it("accepts a started run and returns its identity without waiting for the model", async () => {
    const run = {
      id: "run",
      storyId: "story-31",
      profileId: "writer",
      role: "writer",
      operation: "article_draft",
      outcome: "failed",
    };
    const runtime = {
      createWriterDraft: vi.fn(async () => ({
        ok: true as const,
        runId: run.id,
        completion: Promise.resolve({ ok: true as const, run }),
      })),
      createWriterRevision: vi.fn(),
      close: vi.fn(),
    };
    const scheduled: (() => Promise<void>)[] = [];
    const response = await createWriterDraftHttpHandler({
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

  it("answers 503 naming the credential when the newsroom has no OpenRouter key", async () => {
    const runtime = {
      createWriterDraft: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "OPENROUTER_API_KEY_REQUIRED",
          reason: "CREDENTIAL_NOT_CONFIGURED",
          slot: "openrouter_api_key",
          message: "No openrouter_api_key has been configured for this newsroom.",
        },
      })),
      createWriterRevision: vi.fn(),
      close: vi.fn(),
    };

    const response = await createWriterDraftHttpHandler({
      getRuntime: () => runtime as never,
      environment: { STORYRAIL_OPERATOR_ID: "operator" },
      after: () => {},
    })(
      new Request("http://test/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      context,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: "OPENROUTER_API_KEY_REQUIRED",
        reason: "CREDENTIAL_NOT_CONFIGURED",
        slot: "openrouter_api_key",
      },
    });
  });
});
