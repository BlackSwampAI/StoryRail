// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { newsroomStandardsId, operatorId, type NewsroomStandards } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import {
  createListNewsroomStandardsHttpHandler,
  createSetNewsroomStandardsHttpHandler,
} from "./newsroom-standards-handlers";

const actor = { type: "operator" as const, operatorId: operatorId("operator-brief-http") };
const brief = {
  audience: "Harbour residents",
  readerBenefit: "Know what changed and what to do next.",
  coverageCriteria: "Local services.",
  voice: "Direct and calm.",
  avoid: "Speculation.",
};
const revision: NewsroomStandards = {
  id: newsroomStandardsId("standards-http-brief"),
  revisionNumber: 1,
  text: "Use direct headlines.",
  brief,
  updatedBy: actor,
  updatedAt: "saved-at",
};

const jsonRequest = (body: unknown) =>
  new Request("https://storyrail.test/api/sites/site-a/newsroom-standards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("newsroom standards HTTP handlers", () => {
  it("passes structured brief fields and operator provenance to the append workflow", async () => {
    const setNewsroomStandards = vi.fn<StoryRuntime["setNewsroomStandards"]>(async () => ({
      ok: true,
      standards: revision,
    }));
    const getRuntime = vi.fn(() => ({ setNewsroomStandards }) as unknown as StoryRuntime);
    const handler = createSetNewsroomStandardsHttpHandler({
      getRuntime,
      environment: { STORYRAIL_OPERATOR_ID: " operator-brief-http " },
    });

    const response = await handler(jsonRequest({ text: "Use direct headlines.", brief }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, standards: revision });
    expect(setNewsroomStandards).toHaveBeenCalledWith({
      text: "Use direct headlines.",
      brief,
      updatedBy: actor,
    });
  });

  it("accepts legacy standards-only requests without manufacturing a brief", async () => {
    const setNewsroomStandards = vi.fn<StoryRuntime["setNewsroomStandards"]>(async () => ({
      ok: true,
      standards: revision,
    }));
    const handler = createSetNewsroomStandardsHttpHandler({
      getRuntime: () => ({ setNewsroomStandards }) as unknown as StoryRuntime,
      environment: { STORYRAIL_OPERATOR_ID: actor.operatorId },
    });

    const response = await handler(jsonRequest({ text: "Keep historical style language intact." }));

    expect(response.status).toBe(201);
    expect(setNewsroomStandards).toHaveBeenCalledWith({
      text: "Keep historical style language intact.",
      updatedBy: actor,
    });
  });

  it.each([
    ["unknown nested fields", { ...brief, conclusion: "Guaranteed" }],
    ["oversized answers", { ...brief, voice: "v".repeat(2_001) }],
    ["non-string answers", { ...brief, audience: 4 }],
  ])("rejects a brief with %s before loading the runtime", async (_label, invalidBrief) => {
    const getRuntime = vi.fn(() => ({}) as unknown as StoryRuntime);
    const handler = createSetNewsroomStandardsHttpHandler({
      getRuntime,
      environment: { STORYRAIL_OPERATOR_ID: actor.operatorId },
    });

    const response = await handler(jsonRequest({ text: "Direct headlines.", brief: invalidBrief }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it("reads the complete history including prior structured revisions", async () => {
    const history = [revision, { ...revision, revisionNumber: 2, brief: undefined }];
    const listNewsroomStandards = vi.fn<StoryRuntime["listNewsroomStandards"]>(async () => history);
    const handler = createListNewsroomStandardsHttpHandler({
      getRuntime: () => ({ listNewsroomStandards }) as unknown as StoryRuntime,
    });

    const response = await handler();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, standards: history });
  });
});
