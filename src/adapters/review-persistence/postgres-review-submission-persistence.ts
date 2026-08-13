import { isDeepStrictEqual } from "node:util";
import type { Pool, QueryResultRow } from "pg";

import type { ReviewSubmissionPersistence } from "@/application/review-submissions";
import { STORY_STATES, type Story } from "@/domain/editorial";
import { decodePostgresTransitionReceipt } from "@/adapters/assignment-persistence/postgres-assignment-decoder";
import { PostgresReviewInvariantError } from "./postgres-review-decision-decoder";

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

export function createPostgresReviewSubmissionPersistence(options: {
  readonly pool: Pool;
}): ReviewSubmissionPersistence {
  return {
    async persist(command) {
      const conflict = () => ({
        ok: false as const,
        error: {
          code: "REVIEW_SUBMISSION_CONFLICT" as const,
          message: "The Story or current Article changed before review submission.",
          storyId: command.expectedStory.id,
        },
      });
      if (
        command.expectedStory.state !== "in_progress" ||
        command.story.state !== "in_review" ||
        command.transitionReceipt.storyId !== command.story.id ||
        command.transitionReceipt.previousState !== "in_progress" ||
        command.transitionReceipt.nextState !== "in_review" ||
        command.transitionReceipt.actor.type !== "operator"
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
        const work = await client.query(
          `SELECT 1 FROM storyrail.story_assignments a JOIN storyrail.articles ar ON ar.assignment_id=a.assignment_id JOIN storyrail.article_revisions r ON r.article_id=ar.article_id WHERE a.story_id=$1 LIMIT 1`,
          [command.expectedStory.id],
        );
        if (!work.rows[0]) {
          await client.query("ROLLBACK");
          return conflict();
        }
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
          story: decodeStory(storyResult.rows[0]),
          transitionReceipt: decodePostgresTransitionReceipt(receiptResult.rows[0]),
        };
        if (
          !isDeepStrictEqual(durable, {
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
        if (record(error) && (error.code === "23505" || error.code === "23503")) return conflict();
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
