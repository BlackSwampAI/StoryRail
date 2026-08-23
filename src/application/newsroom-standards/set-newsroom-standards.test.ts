import { describe, expect, it, vi } from "vitest";

import { newsroomStandardsId, operatorId, type NewsroomStandards } from "@/domain/editorial";

import { createSetNewsroomStandards } from "./set-newsroom-standards";

const OPERATOR = { type: "operator" as const, operatorId: operatorId("chris-local") };

function harness(history: readonly NewsroomStandards[] = []) {
  const append = vi.fn(async (standards: NewsroomStandards) => ({ ok: true as const, standards }));
  return {
    append,
    set: createSetNewsroomStandards({
      repository: { append, list: vi.fn(async () => history) },
      createUuid: () => "standards-new",
      now: () => "2026-08-23T12:00:00.000Z",
    }),
  };
}

describe("writing the newsroom's standards", () => {
  it("starts the history at revision one", async () => {
    const test = harness();

    await expect(test.set({ text: "Be plain.", updatedBy: OPERATOR })).resolves.toMatchObject({
      ok: true,
      standards: { revisionNumber: 1, text: "Be plain.", updatedBy: OPERATOR },
    });
  });

  it("appends rather than replacing, so older work stays explainable", async () => {
    const existing = {
      id: newsroomStandardsId("standards-1"),
      revisionNumber: 3,
      text: "Older standards.",
      updatedBy: OPERATOR,
      updatedAt: "2026-08-01T00:00:00.000Z",
    } as NewsroomStandards;
    const test = harness([existing]);

    await expect(
      test.set({ text: "Newer standards.", updatedBy: OPERATOR }),
    ).resolves.toMatchObject({ ok: true, standards: { revisionNumber: 4 } });
    expect(test.append).toHaveBeenCalledOnce();
  });

  it("refuses empty standards without touching the history", async () => {
    const test = harness();

    await expect(test.set({ text: "   ", updatedBy: OPERATOR })).resolves.toMatchObject({
      ok: false,
      error: { code: "NEWSROOM_STANDARDS_TEXT_INVALID" },
    });
    expect(test.append).not.toHaveBeenCalled();
  });
});
