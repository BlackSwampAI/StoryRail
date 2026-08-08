import { describe, expect, it } from "vitest";

import {
  agentRunId,
  canonicalizeSourceUrl,
  intakeUrlSource,
  operatorId,
  sourceId,
  storyId,
  type CanonicalSourceUrl,
  type IntakeUrlSourceCommand,
  type SourceId,
  type StoryId,
  type UrlSource,
} from "./index";

const RECEIVED_AT = "2026-08-08T14:00:00.000Z";
const OPERATOR = {
  type: "operator",
  operatorId: operatorId("operator-0006"),
} as const;
const AGENT = {
  type: "agent",
  role: "assignment_editor",
  runId: agentRunId("run-0006"),
} as const;

function makeCommand(
  submittedUrl: string,
  overrides: Partial<IntakeUrlSourceCommand> = {},
): IntakeUrlSourceCommand {
  return {
    sourceId: sourceId("source-new"),
    submittedUrl,
    submittedBy: OPERATOR,
    receivedAt: RECEIVED_AT,
    ...overrides,
  };
}

function makeExistingSource(
  submittedUrl: string,
  id: SourceId = sourceId("source-existing"),
): UrlSource {
  const canonicalization = canonicalizeSourceUrl(submittedUrl);

  if (!canonicalization.ok) {
    throw new Error("The test fixture URL must be canonicalizable.");
  }

  return {
    id,
    type: "url",
    submittedUrl,
    canonicalUrl: canonicalization.canonicalUrl,
    submittedBy: OPERATOR,
    receivedAt: "2026-08-08T12:00:00.000Z",
  };
}

describe("intakeUrlSource", () => {
  it.each(["http://example.com/report", "https://example.com/report"])(
    "successfully intakes %s",
    (submittedUrl) => {
      const result = intakeUrlSource(makeCommand(submittedUrl), []);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.source.type).toBe("url");
        expect(result.source.canonicalUrl).toBe(submittedUrl);
      }
    },
  );

  it("returns the complete URL Source record and preserves every caller-supplied fact", () => {
    const submittedUrl = "  HTTPS://EXAMPLE.COM:443/report?utm_source=feed&edition=us#top  ";
    const suppliedSourceId = sourceId("source-0006");
    const command = makeCommand(submittedUrl, {
      sourceId: suppliedSourceId,
      submittedBy: OPERATOR,
      receivedAt: RECEIVED_AT,
    });

    const result = intakeUrlSource(command, []);

    expect(result).toEqual({
      ok: true,
      source: {
        id: suppliedSourceId,
        type: "url",
        submittedUrl,
        canonicalUrl: "https://example.com/report?edition=us",
        submittedBy: OPERATOR,
        receivedAt: RECEIVED_AT,
      },
    });
    if (result.ok) {
      expect(result.source.id).toBe(suppliedSourceId);
      expect(result.source.submittedUrl).toBe(submittedUrl);
      expect(result.source.submittedBy).toBe(OPERATOR);
      expect(result.source.receivedAt).toBe(RECEIVED_AT);
    }
  });

  it.each([
    ["operator", OPERATOR],
    ["agent", AGENT],
  ] as const)("preserves %s provenance exactly", (_actorType, submittedBy) => {
    const result = intakeUrlSource(makeCommand("https://example.com/report", { submittedBy }), []);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source.submittedBy).toBe(submittedBy);
      expect(result.source.submittedBy).toEqual(submittedBy);
    }
  });

  it.each([
    ["exact URL", "https://example.com/report?edition=us"],
    ["hostname casing", "https://EXAMPLE.COM/report?edition=us"],
    ["default port", "https://example.com:443/report?edition=us"],
    ["fragment", "https://example.com/report?edition=us#details"],
    ["tracking parameter", "https://example.com/report?edition=us&utm_source=feed"],
  ])("detects a duplicate caused by %s", (_scenario, submittedUrl) => {
    const existingSource = makeExistingSource("https://example.com/report?edition=us");
    const result = intakeUrlSource(makeCommand(submittedUrl), [existingSource]);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DUPLICATE_SOURCE",
        existingSourceId: existingSource.id,
        canonicalUrl: existingSource.canonicalUrl,
      },
    });
    expect("source" in result).toBe(false);
  });

  it.each([
    ["different scheme", "http://example.com/path?edition=us"],
    ["different host", "https://other.example/path?edition=us"],
    ["www variant", "https://www.example.com/path?edition=us"],
    ["different path", "https://example.com/other?edition=us"],
    ["different path casing", "https://example.com/Path?edition=us"],
    ["trailing slash", "https://example.com/path/?edition=us"],
    ["different functional query", "https://example.com/path?edition=uk"],
  ])("does not report a false duplicate for a %s", (_scenario, submittedUrl) => {
    const existingSource = makeExistingSource("https://example.com/path?edition=us");
    const result = intakeUrlSource(makeCommand(submittedUrl), [existingSource]);

    expect(result.ok).toBe(true);
  });

  it("returns the first matching existing Source deterministically", () => {
    const first = makeExistingSource(
      "https://example.com/report?utm_source=first",
      sourceId("source-first"),
    );
    const second = makeExistingSource(
      "https://EXAMPLE.COM:443/report#second",
      sourceId("source-second"),
    );

    const result = intakeUrlSource(makeCommand("https://example.com/report"), [first, second]);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DUPLICATE_SOURCE",
        message: "A Source with the same canonical URL already exists.",
        existingSourceId: sourceId("source-first"),
        canonicalUrl: first.canonicalUrl,
      },
    });
  });

  it("returns exact DUPLICATE_SOURCE context without a new Source", () => {
    const existingSource = makeExistingSource("https://example.com/report?edition=us");
    const result = intakeUrlSource(
      makeCommand("https://EXAMPLE.COM:443/report?utm_source=feed&edition=us#top"),
      [existingSource],
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DUPLICATE_SOURCE",
        message: "A Source with the same canonical URL already exists.",
        existingSourceId: sourceId("source-existing"),
        canonicalUrl: "https://example.com/report?edition=us",
      },
    });
    expect("source" in result).toBe(false);
  });

  it.each([
    ["", []],
    ["x".repeat(2_049), []],
    ["not a URL", []],
    ["ftp://example.com/report", []],
    ["https://user:secret@example.com/report", []],
    ["https://example.com/report", [makeExistingSource("https://example.com/report")]],
  ] as const)(
    "does not return a Source when intake fails for %#",
    (submittedUrl, existingSources) => {
      const result = intakeUrlSource(makeCommand(submittedUrl), existingSources);

      expect(result.ok).toBe(false);
      expect("source" in result).toBe(false);
    },
  );

  it("does not mutate the command or actor on success", () => {
    const actor = Object.freeze({
      type: "agent",
      role: "writer",
      runId: agentRunId("run-immutable"),
    } as const);
    const command = Object.freeze(
      makeCommand(" https://EXAMPLE.COM/report#top ", { submittedBy: actor }),
    );
    const before = { ...command };

    const result = intakeUrlSource(command, Object.freeze([]));

    expect(result.ok).toBe(true);
    expect(command).toEqual(before);
    expect(command.submittedBy).toBe(actor);
  });

  it("does not mutate the command, actor, collection, or records on duplicate failure", () => {
    const actor = Object.freeze({ ...OPERATOR });
    const command = Object.freeze(
      makeCommand("https://EXAMPLE.COM/report#top", { submittedBy: actor }),
    );
    const existingSource = Object.freeze(makeExistingSource("https://example.com/report"));
    const existingSources = Object.freeze([existingSource]);
    const commandBefore = { ...command };
    const existingBefore = { ...existingSource };

    const result = intakeUrlSource(command, existingSources);

    expect(result.ok).toBe(false);
    expect(command).toEqual(commandBefore);
    expect(command.submittedBy).toBe(actor);
    expect(existingSources).toEqual([existingBefore]);
    expect(existingSources[0]).toBe(existingSource);
  });

  it("keeps CanonicalSourceUrl, SourceId, StoryId, and ordinary strings type-distinct", () => {
    const result = intakeUrlSource(makeCommand("https://example.com/report"), []);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const canonical: CanonicalSourceUrl = result.source.canonicalUrl;
    const sourceIdentifier: SourceId = sourceId("source-types");
    const storyIdentifier: StoryId = storyId("story-types");
    const ordinaryString: string = "https://example.com/report";

    // @ts-expect-error An ordinary string is not a CanonicalSourceUrl.
    const canonicalFromString: CanonicalSourceUrl = ordinaryString;
    // @ts-expect-error A SourceId is not a CanonicalSourceUrl.
    const canonicalFromSourceId: CanonicalSourceUrl = sourceIdentifier;
    // @ts-expect-error A StoryId is not a CanonicalSourceUrl.
    const canonicalFromStoryId: CanonicalSourceUrl = storyIdentifier;
    // @ts-expect-error A CanonicalSourceUrl is not a SourceId.
    const sourceIdFromCanonical: SourceId = canonical;
    // @ts-expect-error A CanonicalSourceUrl is not a StoryId.
    const storyIdFromCanonical: StoryId = canonical;

    expect([
      canonical,
      sourceIdentifier,
      storyIdentifier,
      ordinaryString,
      canonicalFromString,
      canonicalFromSourceId,
      canonicalFromStoryId,
      sourceIdFromCanonical,
      storyIdFromCanonical,
    ]).toEqual([
      "https://example.com/report",
      "source-types",
      "story-types",
      "https://example.com/report",
      "https://example.com/report",
      "source-types",
      "story-types",
      "https://example.com/report",
      "https://example.com/report",
    ]);
  });
});
