import { describe, expect, it } from "vitest";

import {
  operatorId,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
  storyId,
} from "@/domain/editorial";

import { citationProvenance } from "./citation-provenance";

const SOURCE = sourceId("source-provenance");
const PREPARED = sourceEvidencePreparationId("prepared-provenance");
const RAW = sourceExtractionId("raw-provenance");
const OPERATOR = { type: "operator" as const, operatorId: operatorId("operator-provenance") };

const document = {
  format: "markdown" as const,
  content: "The release shipped on Tuesday.",
  title: "Announcing the release",
  byline: null,
  publishedAt: null,
  language: null,
};

const inspection = {
  sources: [
    {
      attachment: {
        storyId: storyId("story-provenance"),
        sourceId: SOURCE,
        relevance: "Primary",
        attachedBy: OPERATOR,
        attachedAt: "attached",
      },
      source: {
        id: SOURCE,
        type: "url" as const,
        submittedUrl: "https://example.test/post?utm=1",
        canonicalUrl: "https://example.test/post" as never,
        submittedBy: OPERATOR,
        receivedAt: "received",
      },
      extractions: [
        {
          id: RAW,
          sourceId: SOURCE,
          extractor: { key: "test", version: "1" },
          requestedBy: OPERATOR,
          startedAt: "start",
          completedAt: "end",
          outcome: "succeeded" as const,
          document: { ...document, title: null },
        },
      ],
      preparations: [
        {
          id: PREPARED,
          sourceId: SOURCE,
          extractionId: RAW,
          model: { provider: "openrouter", model: "prep" },
          preparer: { key: "prep", version: "1" },
          input: { rawCharacters: 30, submittedCharacters: 30 },
          requestedBy: OPERATOR,
          startedAt: "start",
          completedAt: "end",
          outcome: "succeeded" as const,
          document,
        },
      ],
    },
  ],
};

const cite = (
  overrides: Partial<{ sourceId: typeof SOURCE; evidenceId: typeof PREPARED }> = {},
) => ({
  sourceId: SOURCE,
  evidenceId: PREPARED,
  quote: "The release shipped",
  ...overrides,
});

describe("resolving where a claim came from", () => {
  it("names the Source and the prepared record that was read", () => {
    expect(citationProvenance(inspection, cite())).toEqual({
      quote: "The release shipped",
      canonicalUrl: "https://example.test/post",
      title: "Announcing the release",
      evidenceKind: "prepared",
    });
  });

  it("distinguishes raw evidence from prepared", () => {
    expect(citationProvenance(inspection, cite({ evidenceId: RAW as never }))).toMatchObject({
      evidenceKind: "raw",
      title: null,
    });
  });

  it("reports an unresolvable citation rather than omitting it", () => {
    // A claim whose support cannot be located is precisely what a reader should notice.
    expect(citationProvenance(inspection, cite({ sourceId: sourceId("elsewhere") }))).toEqual({
      quote: "The release shipped",
      canonicalUrl: null,
      title: null,
      evidenceKind: null,
    });
    expect(
      citationProvenance(inspection, cite({ evidenceId: sourceEvidencePreparationId("gone") })),
    ).toMatchObject({ canonicalUrl: "https://example.test/post", evidenceKind: null });
  });
});
