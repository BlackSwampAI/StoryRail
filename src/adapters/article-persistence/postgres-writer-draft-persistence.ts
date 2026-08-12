import { isDeepStrictEqual } from "node:util";
import type { Pool, QueryResultRow } from "pg";

import type { WriterDraftPersistence } from "@/application/writer-drafts";
import type { Story } from "@/domain/editorial";
import { STORY_STATES } from "@/domain/editorial";
import { decodePostgresAgentRun } from "@/adapters/agent-run-persistence";
import { decodePostgresTransitionReceipt } from "@/adapters/assignment-persistence/postgres-assignment-decoder";
import {
  decodePostgresArticle,
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
    code: "WRITER_DRAFT_CONFLICT" as const,
    message: "The Story changed or received an Article after Writer execution.",
    storyId,
  },
});

export function createPostgresWriterDraftPersistence(options: {
  readonly pool: Pool;
}): WriterDraftPersistence {
  return {
    async persist(command) {
      if (
        command.expectedStory.id !== command.story.id ||
        command.expectedStory.id !== command.run.storyId ||
        command.expectedStory.id !== command.article.storyId ||
        command.run.articleId !== command.article.id ||
        command.run.revisionId !== command.revision.id ||
        command.run.input.assignment.id !== command.article.assignmentId ||
        command.run.input.assignment.storyId !== command.expectedStory.id ||
        command.revision.articleId !== command.article.id ||
        command.revision.agentRunId !== command.run.id ||
        command.revision.writerProfileId !== command.run.profileId ||
        command.transitionReceipt.storyId !== command.expectedStory.id ||
        command.transitionReceipt.previousState !== command.expectedStory.state ||
        command.transitionReceipt.nextState !== command.story.state ||
        command.transitionReceipt.actor.type !== "agent" ||
        command.transitionReceipt.actor.role !== "writer" ||
        command.transitionReceipt.actor.runId !== command.run.id ||
        command.story.state !== "in_progress"
      )
        throw new PostgresArticleInvariantError();
      const client = await options.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query(
          `SELECT story_id, state, revision_cycle, payload FROM storyrail.stories WHERE story_id = $1 FOR UPDATE`,
          [command.expectedStory.id],
        );
        if (
          !current.rows[0] ||
          !isDeepStrictEqual(decodeStory(current.rows[0]), command.expectedStory)
        ) {
          await client.query("ROLLBACK");
          return conflict(command.expectedStory.id);
        }
        const existing = await client.query(
          `SELECT 1 FROM storyrail.articles WHERE story_id = $1`,
          [command.expectedStory.id],
        );
        if (existing.rows[0]) {
          await client.query("ROLLBACK");
          return conflict(command.expectedStory.id);
        }
        const runResult = await client.query(
          `INSERT INTO storyrail.agent_runs (run_id, story_id, profile_id, role, operation, outcome, payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING run_id,story_id,profile_id,role,operation,outcome,payload`,
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
        const articleResult = await client.query(
          `INSERT INTO storyrail.articles (article_id,story_id,assignment_id,payload) VALUES ($1,$2,$3,$4::jsonb) RETURNING article_id,story_id,assignment_id,payload`,
          [
            command.article.id,
            command.article.storyId,
            command.article.assignmentId,
            JSON.stringify(command.article),
          ],
        );
        const revisionResult = await client.query(
          `INSERT INTO storyrail.article_revisions (revision_id,article_id,revision_number,writer_profile_id,agent_run_id,payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING revision_id,article_id,revision_number,writer_profile_id,agent_run_id,payload`,
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
        const durableRun = decodePostgresAgentRun(runResult.rows[0]);
        if (durableRun.role !== "writer" || durableRun.outcome !== "succeeded")
          throw new PostgresArticleInvariantError();
        const durable = {
          run: durableRun,
          article: decodePostgresArticle(articleResult.rows[0]),
          revision: decodePostgresArticleRevision(revisionResult.rows[0]),
          story: decodeStory(storyResult.rows[0]),
          transitionReceipt: decodePostgresTransitionReceipt(receiptResult.rows[0]),
        };
        if (
          !isDeepStrictEqual(durable, {
            run: command.run,
            article: command.article,
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
