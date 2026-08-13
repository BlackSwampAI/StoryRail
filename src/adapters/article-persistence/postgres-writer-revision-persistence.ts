import { isDeepStrictEqual } from "node:util";
import type { Pool, QueryResultRow } from "pg";

import { decodePostgresAgentRun } from "@/adapters/agent-run-persistence";
import { decodePostgresTransitionReceipt } from "@/adapters/assignment-persistence/postgres-assignment-decoder";
import { decodePostgresReviewDecision } from "@/adapters/review-persistence";
import type { WriterRevisionPersistence } from "@/application/writer-revisions";
import { STORY_STATES, type Story } from "@/domain/editorial";
import {
  decodePostgresArticleRevision,
  PostgresArticleInvariantError,
} from "./postgres-article-decoder";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeStory(
  row: QueryResultRow & {
    story_id: unknown;
    state: unknown;
    revision_cycle: unknown;
    payload: unknown;
  },
): Story {
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
    throw new PostgresArticleInvariantError();
  return structuredClone(row.payload) as unknown as Story;
}

const conflict = (storyId: Story["id"]) => ({
  ok: false as const,
  error: {
    code: "WRITER_REVISION_CONFLICT" as const,
    message: "The Story or current Article Revision changed during Writer execution.",
    storyId,
  },
});

export function createPostgresWriterRevisionPersistence(options: {
  readonly pool: Pool;
}): WriterRevisionPersistence {
  return {
    async persist(command) {
      if (
        command.expectedStory.id !== command.story.id ||
        command.expectedStory.id !== command.run.storyId ||
        command.expectedStory.state !== "changes_requested" ||
        command.run.operation !== "article_revision" ||
        command.run.articleId !== command.revision.articleId ||
        command.run.revisionId !== command.revision.id ||
        command.run.input.revision.id !== command.expectedRevision.id ||
        command.revision.revisionNumber !== command.expectedRevision.revisionNumber + 1 ||
        command.revision.agentRunId !== command.run.id ||
        command.revision.writerProfileId !== command.run.profileId ||
        command.transitionReceipt.storyId !== command.expectedStory.id ||
        command.transitionReceipt.previousState !== "changes_requested" ||
        command.transitionReceipt.nextState !== "in_progress" ||
        command.transitionReceipt.actor.type !== "agent" ||
        command.transitionReceipt.actor.role !== "writer" ||
        command.transitionReceipt.actor.runId !== command.run.id ||
        command.story.state !== "in_progress" ||
        command.story.revisionCycle !== command.expectedStory.revisionCycle
      )
        throw new PostgresArticleInvariantError();
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
          return conflict(command.expectedStory.id);
        }
        const latest = await client.query(
          `SELECT revision_id,article_id,revision_number,writer_profile_id,agent_run_id,payload
           FROM storyrail.article_revisions WHERE article_id=$1
           ORDER BY revision_number DESC, append_position DESC LIMIT 1 FOR UPDATE`,
          [command.expectedRevision.articleId],
        );
        if (
          !latest.rows[0] ||
          !isDeepStrictEqual(
            decodePostgresArticleRevision(latest.rows[0]),
            command.expectedRevision,
          )
        ) {
          await client.query("ROLLBACK");
          return conflict(command.expectedStory.id);
        }
        const decision = await client.query(
          `SELECT decision_id,story_id,article_id,revision_id,director_run_id,decision,payload
           FROM storyrail.review_decisions WHERE revision_id=$1 FOR SHARE`,
          [command.expectedRevision.id],
        );
        if (
          !decision.rows[0] ||
          !isDeepStrictEqual(
            decodePostgresReviewDecision(decision.rows[0]),
            command.run.input.reviewDecision,
          )
        ) {
          await client.query("ROLLBACK");
          return conflict(command.expectedStory.id);
        }
        const director = await client.query(
          `SELECT run_id,story_id,profile_id,role,operation,outcome,payload
           FROM storyrail.agent_runs WHERE run_id=$1 FOR SHARE`,
          [command.run.input.reviewDecision.directorRunId],
        );
        const directorRun = director.rows[0] ? decodePostgresAgentRun(director.rows[0]) : undefined;
        if (
          directorRun?.role !== "editor_in_chief" ||
          directorRun.operation !== "article_review" ||
          directorRun.outcome !== "succeeded" ||
          directorRun.input.revision.id !== command.expectedRevision.id ||
          !isDeepStrictEqual(directorRun.review, command.run.input.directorReview)
        ) {
          await client.query("ROLLBACK");
          return conflict(command.expectedStory.id);
        }
        const runResult = await client.query(
          `INSERT INTO storyrail.agent_runs (run_id,story_id,profile_id,role,operation,outcome,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
           RETURNING run_id,story_id,profile_id,role,operation,outcome,payload`,
          [
            command.run.id,
            command.run.storyId,
            command.run.profileId,
            command.run.role,
            command.run.operation,
            command.run.outcome,
            JSON.stringify(command.run),
          ],
        );
        const revisionResult = await client.query(
          `INSERT INTO storyrail.article_revisions (revision_id,article_id,revision_number,writer_profile_id,agent_run_id,payload)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)
           RETURNING revision_id,article_id,revision_number,writer_profile_id,agent_run_id,payload`,
          [
            command.revision.id,
            command.revision.articleId,
            command.revision.revisionNumber,
            command.revision.writerProfileId,
            command.revision.agentRunId,
            JSON.stringify(command.revision),
          ],
        );
        const storyResult = await client.query(
          `UPDATE storyrail.stories SET state=$2,revision_cycle=$3,payload=$4::jsonb WHERE story_id=$1
           RETURNING story_id,state,revision_cycle,payload`,
          [
            command.story.id,
            command.story.state,
            command.story.revisionCycle,
            JSON.stringify(command.story),
          ],
        );
        const receiptResult = await client.query(
          `INSERT INTO storyrail.story_transition_receipts (transition_id,story_id,previous_state,next_state,revision_cycle,payload)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)
           RETURNING transition_id,story_id,previous_state,next_state,revision_cycle,payload`,
          [
            command.transitionReceipt.transitionId,
            command.transitionReceipt.storyId,
            command.transitionReceipt.previousState,
            command.transitionReceipt.nextState,
            command.transitionReceipt.revisionCycle,
            JSON.stringify(command.transitionReceipt),
          ],
        );
        const durableRun = decodePostgresAgentRun(runResult.rows[0]);
        if (
          durableRun.role !== "writer" ||
          durableRun.operation !== "article_revision" ||
          durableRun.outcome !== "succeeded"
        )
          throw new PostgresArticleInvariantError();
        const durable = {
          run: durableRun,
          revision: decodePostgresArticleRevision(revisionResult.rows[0]),
          story: decodeStory(storyResult.rows[0]),
          transitionReceipt: decodePostgresTransitionReceipt(receiptResult.rows[0]),
        };
        if (
          !isDeepStrictEqual(durable, {
            run: command.run,
            revision: command.revision,
            story: command.story,
            transitionReceipt: command.transitionReceipt,
          })
        )
          throw new PostgresArticleInvariantError();
        await client.query("COMMIT");
        return { ok: true, ...durable };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* preserve original */
        }
        if (record(error) && (error.code === "23505" || error.code === "23503"))
          return conflict(command.expectedStory.id);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
