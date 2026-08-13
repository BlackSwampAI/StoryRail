import { isDeepStrictEqual } from "node:util";
import type { Pool, QueryResultRow } from "pg";

import type { ReviewDecisionPersistence } from "@/application/review-decisions";
import { STORY_STATES, type Story } from "@/domain/editorial";
import { decodePostgresTransitionReceipt } from "@/adapters/assignment-persistence/postgres-assignment-decoder";
import {
  decodePostgresReviewDecision,
  PostgresReviewInvariantError,
} from "./postgres-review-decision-decoder";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function decodeStory(row: QueryResultRow): Story {
  if (
    typeof row.story_id !== "string" ||
    typeof row.state !== "string" ||
    !(STORY_STATES as readonly string[]).includes(row.state) ||
    !Number.isInteger(row.revision_cycle) ||
    !record(row.payload) ||
    row.payload.id !== row.story_id ||
    row.payload.state !== row.state ||
    row.payload.revisionCycle !== row.revision_cycle
  )
    throw new PostgresReviewInvariantError();
  return structuredClone(row.payload) as unknown as Story;
}

export function createPostgresReviewDecisionPersistence(options: {
  readonly pool: Pool;
}): ReviewDecisionPersistence {
  return {
    async persist(command) {
      const conflict = (
        code:
          | "REVIEW_DECISION_ALREADY_EXISTS"
          | "REVIEW_DECISION_ID_CONFLICT"
          | "REVIEW_DECISION_CONFLICT" = "REVIEW_DECISION_CONFLICT",
      ) => ({
        ok: false as const,
        error: {
          code,
          message:
            code === "REVIEW_DECISION_ALREADY_EXISTS"
              ? "The current Article Revision already has an operator decision."
              : "The Story review decision conflicted with durable state.",
          storyId: command.expectedStory.id,
          ...(code === "REVIEW_DECISION_ID_CONFLICT" ? { decisionId: command.decision.id } : {}),
        },
      });
      if (
        command.expectedStory.state !== "in_review" ||
        command.story.id !== command.expectedStory.id ||
        command.decision.storyId !== command.story.id ||
        command.transitionReceipt.storyId !== command.story.id ||
        command.transitionReceipt.actor.type !== "operator" ||
        !isDeepStrictEqual(command.transitionReceipt.actor, command.decision.decidedBy) ||
        command.transitionReceipt.reason !== command.decision.reason ||
        command.transitionReceipt.occurredAt !== command.decision.decidedAt
      )
        throw new PostgresReviewInvariantError();
      const client = await options.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query(
          `SELECT story_id,state,revision_cycle,payload FROM storyrail.stories WHERE story_id=$1 FOR UPDATE`,
          [command.expectedStory.id],
        );
        if (
          !current.rows[0] ||
          !isDeepStrictEqual(decodeStory(current.rows[0]), command.expectedStory)
        ) {
          await client.query("ROLLBACK");
          return conflict();
        }
        const currentRevision = await client.query(
          `SELECT article.article_id, revision.revision_id
           FROM storyrail.articles AS article
           JOIN storyrail.article_revisions AS revision ON revision.article_id = article.article_id
           WHERE article.story_id = $1
           ORDER BY revision.revision_number DESC, revision.append_position DESC
           LIMIT 1`,
          [command.expectedStory.id],
        );
        if (
          currentRevision.rows[0]?.article_id !== command.decision.articleId ||
          currentRevision.rows[0]?.revision_id !== command.decision.revisionId
        ) {
          await client.query("ROLLBACK");
          return conflict();
        }
        const existing = await client.query(
          `SELECT decision_id FROM storyrail.review_decisions WHERE revision_id=$1`,
          [command.decision.revisionId],
        );
        if (existing.rows[0]) {
          await client.query("ROLLBACK");
          return conflict("REVIEW_DECISION_ALREADY_EXISTS");
        }
        const decisionResult = await client.query(
          `INSERT INTO storyrail.review_decisions (decision_id,story_id,article_id,revision_id,director_run_id,decision,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING decision_id,story_id,article_id,revision_id,director_run_id,decision,payload`,
          [
            command.decision.id,
            command.decision.storyId,
            command.decision.articleId,
            command.decision.revisionId,
            command.decision.directorRunId,
            command.decision.decision,
            JSON.stringify(command.decision),
          ],
        );
        const storyResult = await client.query(
          `UPDATE storyrail.stories SET state=$2,revision_cycle=$3,payload=$4::jsonb WHERE story_id=$1 RETURNING story_id,state,revision_cycle,payload`,
          [
            command.story.id,
            command.story.state,
            command.story.revisionCycle,
            JSON.stringify(command.story),
          ],
        );
        const receiptResult = await client.query(
          `INSERT INTO storyrail.story_transition_receipts (transition_id,story_id,previous_state,next_state,revision_cycle,payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING transition_id,story_id,previous_state,next_state,revision_cycle,payload`,
          [
            command.transitionReceipt.transitionId,
            command.transitionReceipt.storyId,
            command.transitionReceipt.previousState,
            command.transitionReceipt.nextState,
            command.transitionReceipt.revisionCycle,
            JSON.stringify(command.transitionReceipt),
          ],
        );
        const durable = {
          decision: decodePostgresReviewDecision(decisionResult.rows[0]),
          story: decodeStory(storyResult.rows[0]),
          transitionReceipt: decodePostgresTransitionReceipt(receiptResult.rows[0]),
        };
        if (
          !isDeepStrictEqual(durable, {
            decision: command.decision,
            story: command.story,
            transitionReceipt: command.transitionReceipt,
          })
        )
          throw new PostgresReviewInvariantError();
        await client.query("COMMIT");
        return { ok: true, ...durable };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* preserve original */
        }
        if (record(error) && error.code === "23505") {
          if (error.constraint === "review_decisions_revision_id_key")
            return conflict("REVIEW_DECISION_ALREADY_EXISTS");
          if (error.constraint === "review_decisions_pkey")
            return conflict("REVIEW_DECISION_ID_CONFLICT");
          return conflict();
        }
        if (record(error) && error.code === "23503") return conflict();
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
