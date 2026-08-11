import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type { AssignmentPersistence } from "@/application/assignments";
import type { Story, StoryState } from "@/domain/editorial";
import { STORY_STATES } from "@/domain/editorial";

import {
  decodePostgresAssignment,
  decodePostgresTransitionReceipt,
  PostgresAssignmentInvariantError,
} from "./postgres-assignment-decoder";

interface StoryRow extends QueryResultRow {
  readonly story_id: unknown;
  readonly state: unknown;
  readonly revision_cycle: unknown;
  readonly payload: unknown;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function state(value: unknown): value is StoryState {
  return typeof value === "string" && (STORY_STATES as readonly string[]).includes(value);
}

function decodeStory(row: StoryRow): Story {
  const value = row.payload;
  if (
    typeof row.story_id !== "string" ||
    !state(row.state) ||
    !Number.isInteger(row.revision_cycle) ||
    !record(value) ||
    Object.keys(value).sort().join(",") !== "createdAt,id,revisionCycle,state,title,updatedAt" ||
    value.id !== row.story_id ||
    value.state !== row.state ||
    value.revisionCycle !== row.revision_cycle ||
    typeof value.title !== "string" ||
    value.title.trim().length === 0 ||
    value.title !== value.title.trim() ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  )
    throw new PostgresAssignmentInvariantError();
  return structuredClone(value) as unknown as Story;
}

function conflict(storyId: Story["id"]) {
  return {
    ok: false as const,
    error: {
      code: "STORY_ASSIGNMENT_CONFLICT" as const,
      message: "The Story was changed or assigned by another request.",
      storyId,
    },
  };
}

export function createPostgresAssignmentPersistence(options: {
  readonly pool: Pool;
}): AssignmentPersistence {
  return {
    async persist(command) {
      if (
        command.assignment.storyId !== command.expectedStory.id ||
        command.story.id !== command.expectedStory.id ||
        command.transitionReceipt.storyId !== command.expectedStory.id ||
        command.transitionReceipt.previousState !== command.expectedStory.state ||
        command.transitionReceipt.nextState !== command.story.state ||
        command.transitionReceipt.revisionCycle !== command.story.revisionCycle ||
        command.assignment.assignedAt !== command.transitionReceipt.occurredAt ||
        command.story.updatedAt !== command.transitionReceipt.occurredAt ||
        !isDeepStrictEqual(command.assignment.assignedBy, command.transitionReceipt.actor)
      ) {
        throw new PostgresAssignmentInvariantError();
      }
      const client = await options.pool.connect();
      try {
        await client.query("BEGIN");
        const storyResult = await client.query<StoryRow>(
          `SELECT story_id, state, revision_cycle, payload
           FROM storyrail.stories WHERE story_id = $1 FOR UPDATE`,
          [command.expectedStory.id],
        );
        const row = storyResult.rows[0];
        if (!row || !isDeepStrictEqual(decodeStory(row), command.expectedStory)) {
          await client.query("ROLLBACK");
          return conflict(command.expectedStory.id);
        }

        const profile = await client.query<QueryResultRow & { readonly role: unknown }>(
          `SELECT role FROM storyrail.agent_profiles WHERE profile_id = $1`,
          [command.assignment.writerProfileId],
        );
        if (!profile.rows[0]) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            error: {
              code: "AGENT_PROFILE_NOT_FOUND",
              message: "The selected Agent Profile does not exist.",
              profileId: command.assignment.writerProfileId,
            },
          };
        }
        if (profile.rows[0].role !== "writer") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            error: {
              code: "AGENT_PROFILE_NOT_WRITER",
              message: "The selected Agent Profile is not a Writer.",
              profileId: command.assignment.writerProfileId,
            },
          };
        }

        const existing = await client.query(
          `SELECT 1 FROM storyrail.story_assignments WHERE story_id = $1`,
          [command.expectedStory.id],
        );
        if (existing.rows[0]) {
          await client.query("ROLLBACK");
          return conflict(command.expectedStory.id);
        }
        const sources = await client.query<QueryResultRow & { readonly source_id: string }>(
          `SELECT source_id FROM storyrail.story_source_attachments
           WHERE story_id = $1 ORDER BY source_id COLLATE "C" ASC`,
          [command.expectedStory.id],
        );
        if (
          !isDeepStrictEqual(
            sources.rows.map(({ source_id }) => source_id),
            command.assignment.sourceIds,
          )
        ) {
          await client.query("ROLLBACK");
          return conflict(command.expectedStory.id);
        }

        const assignmentResult = await client.query(
          `INSERT INTO storyrail.story_assignments
             (assignment_id, story_id, writer_profile_id, writer_role, payload)
           VALUES ($1, $2, $3, 'writer', $4::jsonb)
           RETURNING assignment_id, story_id, writer_profile_id, writer_role, payload`,
          [
            command.assignment.id,
            command.assignment.storyId,
            command.assignment.writerProfileId,
            JSON.stringify(command.assignment),
          ],
        );
        const storyUpdate = await client.query<StoryRow>(
          `UPDATE storyrail.stories SET state = $2, revision_cycle = $3, payload = $4::jsonb
           WHERE story_id = $1
           RETURNING story_id, state, revision_cycle, payload`,
          [
            command.story.id,
            command.story.state,
            command.story.revisionCycle,
            JSON.stringify(command.story),
          ],
        );
        const receiptResult = await client.query(
          `INSERT INTO storyrail.story_transition_receipts
             (transition_id, story_id, previous_state, next_state, revision_cycle, payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           RETURNING transition_id, story_id, previous_state, next_state, revision_cycle, payload`,
          [
            command.transitionReceipt.transitionId,
            command.transitionReceipt.storyId,
            command.transitionReceipt.previousState,
            command.transitionReceipt.nextState,
            command.transitionReceipt.revisionCycle,
            JSON.stringify(command.transitionReceipt),
          ],
        );
        const assignmentRow = assignmentResult.rows[0];
        const updatedStoryRow = storyUpdate.rows[0];
        const receiptRow = receiptResult.rows[0];
        if (!assignmentRow || !updatedStoryRow || !receiptRow)
          throw new PostgresAssignmentInvariantError();
        const durable = {
          assignment: decodePostgresAssignment(assignmentRow),
          story: decodeStory(updatedStoryRow),
          transitionReceipt: decodePostgresTransitionReceipt(receiptRow),
        };
        if (
          !isDeepStrictEqual(durable, {
            assignment: command.assignment,
            story: command.story,
            transitionReceipt: command.transitionReceipt,
          })
        )
          throw new PostgresAssignmentInvariantError();
        await client.query("COMMIT");
        return { ok: true, ...durable };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* preserve the original failure */
        }
        if (record(error) && error.code === "23505") return conflict(command.expectedStory.id);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
