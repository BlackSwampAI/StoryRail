import { describe, expect, it } from "vitest";

import { decodePostgresSourceExtraction } from "./postgres-source-extraction-decoder";

const payload = {
  id: "extraction-decoder",
  sourceId: "source-decoder",
  extractor: { key: "plain-http", version: "1" },
  requestedBy: { type: "operator", operatorId: "operator-decoder" },
  startedAt: "opaque-started",
  completedAt: "opaque-completed",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Extracted report",
    title: "Extracted report",
    byline: null,
    publishedAt: null,
    language: "en",
  },
} as const;

const invariantError = () => new Error("safe extraction invariant");

describe("PostgreSQL Source extraction decoder", () => {
  it("decodes and clones a valid payload without changing it", () => {
    const before = structuredClone(payload);
    const decoded = decodePostgresSourceExtraction(payload, invariantError);

    expect(decoded).toEqual(payload);
    expect(decoded).not.toBe(payload);
    expect(payload).toEqual(before);
  });

  it("rejects an unexpected top-level key with the supplied invariant", () => {
    expect(() =>
      decodePostgresSourceExtraction({ ...payload, unexpected: true }, invariantError),
    ).toThrow("safe extraction invariant");
  });
});
