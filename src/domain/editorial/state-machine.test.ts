import { describe, expect, it } from "vitest";

import {
  MAX_REVISION_CYCLES,
  PERMITTED_STORY_TRANSITIONS,
  STORY_STATES,
  agentRunId,
  articleId,
  operatorId,
  sourceId,
  storyId,
  transitionId,
  transitionStory,
  type AgentRunId,
  type ArticleId,
  type EditorialActor,
  type OperatorId,
  type SourceId,
  type Story,
  type StoryId,
  type StoryState,
  type TransitionId,
} from "./index";

const CREATED_AT = "2026-08-08T12:00:00.000Z";
const OCCURRED_AT = "2026-08-08T13:00:00.000Z";
const OPERATOR = {
  type: "operator",
  operatorId: operatorId("operator-0001"),
} as const;
const AGENT = {
  type: "agent",
  role: "editor_in_chief",
  runId: agentRunId("run-0001"),
} as const;

function makeStory(state: StoryState, revisionCycle = 0): Readonly<Story> {
  return Object.freeze({
    id: storyId("story-0001"),
    title: "A candidate story",
    state,
    revisionCycle,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
}

function actorFor(nextState: StoryState): EditorialActor {
  return ["approved", "rejected", "published"].includes(nextState) ? OPERATOR : AGENT;
}

function attempt(
  story: Readonly<Story>,
  nextState: StoryState,
  actor: EditorialActor = actorFor(nextState),
  reason = "Editorial requirements are satisfied.",
) {
  return transitionStory({
    story,
    nextState,
    actor,
    reason,
    transitionId: transitionId("transition-0001"),
    occurredAt: OCCURRED_AT,
  });
}

const allowedTransitions = [
  { previousState: "intake", nextState: "assigned" },
  { previousState: "intake", nextState: "rejected" },
  { previousState: "assigned", nextState: "in_progress" },
  { previousState: "assigned", nextState: "rejected" },
  { previousState: "in_progress", nextState: "in_review" },
  { previousState: "in_progress", nextState: "rejected" },
  { previousState: "in_review", nextState: "changes_requested" },
  { previousState: "in_review", nextState: "approved" },
  { previousState: "in_review", nextState: "rejected" },
  { previousState: "changes_requested", nextState: "in_progress" },
  { previousState: "changes_requested", nextState: "rejected" },
  { previousState: "approved", nextState: "published" },
] as const satisfies readonly {
  readonly previousState: StoryState;
  readonly nextState: StoryState;
}[];

const disallowedTransitions = STORY_STATES.flatMap((previousState) =>
  STORY_STATES.filter(
    (nextState) =>
      !allowedTransitions.some(
        (transition) =>
          transition.previousState === previousState && transition.nextState === nextState,
      ),
  ).map((nextState) => ({ previousState, nextState })),
);

describe("transitionStory", () => {
  it("exposes the exact editorial transition matrix", () => {
    expect(PERMITTED_STORY_TRANSITIONS).toEqual({
      intake: ["assigned", "rejected"],
      assigned: ["in_progress", "rejected"],
      in_progress: ["in_review", "rejected"],
      in_review: ["changes_requested", "approved", "rejected"],
      changes_requested: ["in_progress", "rejected"],
      approved: ["published"],
      rejected: [],
      published: [],
    });
  });

  describe.each(allowedTransitions)(
    "$previousState -> $nextState",
    ({ previousState, nextState }) => {
      it("permits the documented transition", () => {
        const result = attempt(makeStory(previousState), nextState);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.story.state).toBe(nextState);
          expect(result.receipt.previousState).toBe(previousState);
          expect(result.receipt.nextState).toBe(nextState);
        }
      });
    },
  );

  it.each(disallowedTransitions)(
    "rejects the unlisted $previousState -> $nextState transition",
    ({ previousState, nextState }) => {
      const result = attempt(makeStory(previousState), nextState, OPERATOR);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "INVALID_TRANSITION",
          previousState,
          nextState,
        },
      });
      expect("receipt" in result).toBe(false);
    },
  );

  it.each(["rejected", "published"] as const)("treats %s as terminal", (previousState) => {
    for (const nextState of STORY_STATES) {
      const result = attempt(makeStory(previousState), nextState, OPERATOR);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TRANSITION");
      }
    }
  });

  it("increments the revision cycle only when changes are requested", () => {
    const changesResult = attempt(makeStory("in_review"), "changes_requested");
    const reviewResult = attempt(makeStory("in_progress"), "in_review");

    expect(changesResult.ok).toBe(true);
    expect(reviewResult.ok).toBe(true);
    if (changesResult.ok && reviewResult.ok) {
      expect(changesResult.story.revisionCycle).toBe(1);
      expect(changesResult.receipt.revisionCycle).toBe(1);
      expect(reviewResult.story.revisionCycle).toBe(0);
    }
  });

  it("allows a second changes-requested cycle", () => {
    const result = attempt(makeStory("in_review", 1), "changes_requested");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.story.revisionCycle).toBe(MAX_REVISION_CYCLES);
      expect(result.receipt.revisionCycle).toBe(MAX_REVISION_CYCLES);
    }
  });

  it("rejects a third changes request without a receipt or story mutation", () => {
    const story = makeStory("in_review", 2);
    const before = { ...story };
    const result = attempt(story, "changes_requested");

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "REVISION_LIMIT_REACHED",
        previousState: "in_review",
        nextState: "changes_requested",
        revisionCycle: 2,
        maximumRevisionCycles: 2,
      },
    });
    expect("receipt" in result).toBe(false);
    expect(story).toEqual(before);
  });

  it.each([
    ["in_review", "approved"],
    ["intake", "rejected"],
    ["approved", "published"],
  ] as const)("requires an operator for %s -> %s", (previousState, nextState) => {
    const result = attempt(makeStory(previousState), nextState, AGENT);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "OPERATOR_REQUIRED",
        previousState,
        nextState,
        actorType: "agent",
      },
    });
    expect("receipt" in result).toBe(false);
  });

  it.each(["intake", "assigned", "in_progress", "in_review", "changes_requested"] as const)(
    "requires an operator to reject from %s",
    (previousState) => {
      const result = attempt(makeStory(previousState), "rejected", AGENT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("OPERATOR_REQUIRED");
      }
    },
  );

  it.each([
    ["in_review", "approved"],
    ["intake", "rejected"],
    ["approved", "published"],
  ] as const)(
    "preserves the operator identity in a successful %s -> %s receipt",
    (previousState, nextState) => {
      const result = attempt(makeStory(previousState), nextState, OPERATOR);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.receipt.actor).toEqual({
          type: "operator",
          operatorId: operatorId("operator-0001"),
        });
        expect(result.receipt.actor.type).toBe("operator");
        if (result.receipt.actor.type === "operator") {
          expect(result.receipt.actor.operatorId).toBe(operatorId("operator-0001"));
        }
      }
    },
  );

  it.each(["", "   ", "\n\t"])("rejects a missing editorial reason %#", (reason) => {
    const result = attempt(makeStory("intake"), "assigned", AGENT, reason);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "REASON_REQUIRED",
        previousState: "intake",
        nextState: "assigned",
      },
    });
    expect("receipt" in result).toBe(false);
  });

  it("returns a complete durable receipt and a new Story", () => {
    const story = makeStory("in_review");
    const actor = {
      type: "agent",
      role: "fact_checker",
      runId: agentRunId("run-0042"),
    } as const;

    const result = transitionStory({
      story,
      nextState: "changes_requested",
      actor,
      reason: "  Verify the primary-source date.  ",
      transitionId: transitionId("transition-0042"),
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.story).not.toBe(story);
      expect(result.story).toEqual({
        ...story,
        state: "changes_requested",
        revisionCycle: 1,
        updatedAt: OCCURRED_AT,
      });
      expect(result.receipt).toEqual({
        transitionId: transitionId("transition-0042"),
        storyId: story.id,
        previousState: "in_review",
        nextState: "changes_requested",
        actor,
        reason: "Verify the primary-source date.",
        occurredAt: OCCURRED_AT,
        revisionCycle: 1,
      });
    }
  });

  it("does not mutate the input Story on success", () => {
    const story = makeStory("assigned");
    const before = { ...story };

    const result = attempt(story, "in_progress");

    expect(result.ok).toBe(true);
    expect(story).toEqual(before);
  });

  it("does not mutate the input Story on an invalid-transition failure", () => {
    const story = makeStory("intake");
    const before = { ...story };

    const result = attempt(story, "published", OPERATOR);

    expect(result.ok).toBe(false);
    expect("receipt" in result).toBe(false);
    expect(story).toEqual(before);
  });
});

describe("editorial identifiers", () => {
  it("keeps Source, Story, and Article identities type-distinct", () => {
    const sourceIdentifier = sourceId("source-0001");
    const storyIdentifier = storyId("story-0001");
    const articleIdentifier = articleId("article-0001");
    const runIdentifier = agentRunId("run-0001");
    const operatorIdentifier = operatorId("operator-0001");
    const transitionIdentifier = transitionId("transition-0001");

    const source: SourceId = sourceIdentifier;
    const story: StoryId = storyIdentifier;
    const article: ArticleId = articleIdentifier;
    const run: AgentRunId = runIdentifier;
    const operator: OperatorId = operatorIdentifier;
    const transition: TransitionId = transitionIdentifier;

    // @ts-expect-error A SourceId cannot be used as a StoryId.
    const invalidStory: StoryId = sourceIdentifier;
    // @ts-expect-error An ArticleId cannot be used as a SourceId.
    const invalidSource: SourceId = articleIdentifier;
    // @ts-expect-error An AgentRunId cannot be used as a TransitionId.
    const invalidTransition: TransitionId = runIdentifier;
    // @ts-expect-error An OperatorId cannot be used as a SourceId.
    const invalidSourceFromOperator: SourceId = operatorIdentifier;
    // @ts-expect-error An OperatorId cannot be used as a StoryId.
    const invalidStoryFromOperator: StoryId = operatorIdentifier;
    // @ts-expect-error An OperatorId cannot be used as an ArticleId.
    const invalidArticleFromOperator: ArticleId = operatorIdentifier;
    // @ts-expect-error An OperatorId cannot be used as an AgentRunId.
    const invalidRunFromOperator: AgentRunId = operatorIdentifier;
    // @ts-expect-error An OperatorId cannot be used as a TransitionId.
    const invalidTransitionFromOperator: TransitionId = operatorIdentifier;

    expect([
      source,
      story,
      article,
      run,
      operator,
      transition,
      invalidStory,
      invalidSource,
      invalidTransition,
      invalidSourceFromOperator,
      invalidStoryFromOperator,
      invalidArticleFromOperator,
      invalidRunFromOperator,
      invalidTransitionFromOperator,
    ]).toEqual([
      "source-0001",
      "story-0001",
      "article-0001",
      "run-0001",
      "operator-0001",
      "transition-0001",
      "source-0001",
      "article-0001",
      "run-0001",
      "operator-0001",
      "operator-0001",
      "operator-0001",
      "operator-0001",
      "operator-0001",
    ]);
  });
});
