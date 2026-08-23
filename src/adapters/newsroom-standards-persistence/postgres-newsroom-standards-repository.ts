import type { Pool } from "pg";
import { z } from "zod";

import type {
  AppendNewsroomStandardsResult,
  NewsroomStandardsRepository,
} from "@/application/newsroom-standards";
import { recordNewsroomStandards, type NewsroomStandards } from "@/domain/editorial";

export class PostgresNewsroomStandardsInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned invalid or impossible persisted newsroom standards.");
    this.name = "PostgresNewsroomStandardsInvariantError";
  }
}

const nonEmpty = z.string().refine((value) => value.trim().length > 0);
const schema = z
  .object({
    id: nonEmpty,
    revisionNumber: z.number().int().min(1),
    text: nonEmpty,
    updatedBy: z.object({ type: z.literal("operator"), operatorId: nonEmpty }).strict(),
    updatedAt: nonEmpty,
  })
  .strict();

export function createPostgresNewsroomStandardsRepository(dependencies: {
  readonly pool: Pool;
}): NewsroomStandardsRepository {
  return {
    async append(standards: NewsroomStandards): Promise<AppendNewsroomStandardsResult> {
      try {
        await dependencies.pool.query(
          `INSERT INTO storyrail.newsroom_standards (standards_id, revision_number, payload)
           VALUES ($1, $2, $3::jsonb)`,
          [standards.id, standards.revisionNumber, JSON.stringify(standards)],
        );
        return { ok: true, standards };
      } catch (caught) {
        if ((caught as { readonly code?: string }).code === "23505")
          return {
            ok: false,
            error: {
              code: "NEWSROOM_STANDARDS_REVISION_CONFLICT",
              message: "Another revision was written first. Reload and try again.",
            },
          };
        throw caught;
      }
    },

    async list(): Promise<readonly NewsroomStandards[]> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        "SELECT payload FROM storyrail.newsroom_standards ORDER BY revision_number",
      );
      return rows.map((row) => {
        const parsed = schema.safeParse(row.payload);
        if (!parsed.success) throw new PostgresNewsroomStandardsInvariantError();
        const recorded = recordNewsroomStandards(parsed.data as unknown as NewsroomStandards);
        if (!recorded.ok) throw new PostgresNewsroomStandardsInvariantError();
        return recorded.standards;
      });
    },
  };
}
