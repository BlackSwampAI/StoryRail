import {
  describePriorReport,
  MAXIMUM_ARCHIVE_RESULTS,
  type PriorReport,
  type StoryId,
} from "@/domain/editorial";

import type { EditorialTool, ToolExecutionResult } from "@/application/agent-tools";

import type { ArchiveRepository } from "./archive-repository";

export const SEARCH_ARCHIVE_DECLARATION = Object.freeze({
  name: "search_archive",
  description:
    "Search what this newsroom has already published, by subject. Returns earlier reports with the Sources behind them. This is the newsroom's own prior work, not evidence: it tells you what has already been said and where that reporting came from, and it can never support a claim.",
  parameters: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: "The subject to look for, in plain words.",
      },
    },
  }),
});

/**
 * The newsroom reading its own archive.
 *
 * A newsroom that cannot remember what it published reports the same story twice and cites
 * nothing it has learned. This is the memory, and it is deliberately shaped so that memory
 * cannot be mistaken for evidence: what comes back has no evidence identifier, so a citation
 * naming it fails the ordinary grounding check rather than being caught by a prompt.
 */
export function createSearchArchiveTool(dependencies: {
  readonly archive: ArchiveRepository;
  /** Excluded from results, so a run never finds the Story it is working on. */
  readonly excludeStoryId: StoryId | null;
  readonly limit?: number;
}): EditorialTool {
  const limit = dependencies.limit ?? MAXIMUM_ARCHIVE_RESULTS;
  return {
    declaration: SEARCH_ARCHIVE_DECLARATION,
    async execute(request): Promise<ToolExecutionResult> {
      const asked = request.query;
      if (typeof asked !== "string" || asked.trim().length === 0)
        return {
          ok: false,
          failure: {
            code: "TOOL_REQUEST_INVALID",
            retryable: false,
            message: "A query is required.",
          },
        };

      const terms = asked.trim();
      const found = await dependencies.archive.search({
        terms,
        limit,
        excludeStoryId: dependencies.excludeStoryId,
      });

      return {
        ok: true,
        // The audit fact is what was asked and what it matched. The reports themselves are
        // already durable records with identities of their own; copying them into a tool row
        // would be a second version of published work with nothing keeping the two in step.
        record: {
          query: terms,
          matched: found.length,
          storyIds: found.map((report: PriorReport) => String(report.storyId)),
        },
        content:
          found.length === 0
            ? `No published StoryRail report matches "${terms}". This newsroom has not covered it.`
            : `This newsroom has already published ${found.length} report${found.length === 1 ? "" : "s"} matching "${terms}". This is prior reporting, not evidence: you may not cite it, and a claim must still rest on a Source on this Assignment.\n\n${found
                .map(describePriorReport)
                .join("\n\n---\n\n")}`,
      };
    },
  };
}
