import { describe, expect, it } from "vitest";

import type { ArticleGroundingMeasurement } from "@/domain/editorial";

import { groundingReading } from "./grounding-summary";

const measurement = (
  overrides: Partial<ArticleGroundingMeasurement>,
): ArticleGroundingMeasurement => ({
  claimBlocks: 1,
  contextBlocks: 0,
  headingBlocks: 0,
  citations: 1,
  groundedShare: 1,
  derivedShare: 0,
  ...overrides,
});

describe("reading a grounding measurement", () => {
  it("says plainly when nothing is attributed", () => {
    expect(
      groundingReading(
        measurement({ claimBlocks: 0, contextBlocks: 3, citations: 0, groundedShare: 0 }),
      ).verdict,
    ).toContain("Nothing in this Article is attributed to its evidence.");
  });

  it("does not call a restatement a success merely because it is attributed", () => {
    // Fully cited and lifted wholesale. Reporting only the first number would praise this.
    const reading = groundingReading(measurement({ groundedShare: 1, derivedShare: 0.82 }));
    expect(reading.grounded).toBe("100%");
    expect(reading.derived).toBe("82%");
    expect(reading.verdict).toContain("Largely its sources restated");
  });

  it("flags an Article resting mostly on the Writer", () => {
    expect(
      groundingReading(measurement({ claimBlocks: 1, contextBlocks: 4, groundedShare: 0.2 }))
        .verdict,
    ).toContain("rests on the Writer rather than the evidence");
  });

  it("approves work that is both attributed and written", () => {
    expect(
      groundingReading(measurement({ groundedShare: 0.9, derivedShare: 0.05 })).verdict,
    ).toContain("mostly written rather than copied");
  });

  it("reports nothing to weigh rather than a misleading zero", () => {
    const reading = groundingReading(
      measurement({
        claimBlocks: 0,
        contextBlocks: 0,
        citations: 0,
        groundedShare: null,
        derivedShare: null,
      }),
    );
    expect(reading.grounded).toBe("—");
    expect(reading.derived).toBe("—");
    expect(reading.verdict).toContain("Nothing to weigh yet.");
  });
});
