import { z } from "zod";

import {
  DIRECTOR_CHECK_NAMES,
  DIRECTOR_CHECK_STATUSES,
  DIRECTOR_RECOMMENDATIONS,
  type DirectorCheckName,
} from "./director-review-types";
import { nonEmptyText } from "./schema-primitives";

export const directorCheckSchema = z
  .object({
    status: z.enum(DIRECTOR_CHECK_STATUSES),
    note: nonEmptyText,
    // A check that cannot point at the passage it judged is not a review of this Article.
    quoted: nonEmptyText,
  })
  .strict();

/**
 * The checks are built from the domain's own list rather than named here.
 *
 * Naming them was how the browser fell a check behind: `support` was added to the domain and the
 * literal that described a Director review was not, so no Writer revision run validated at all
 * and every Story that had been through a revision cycle became unopenable.
 */
export const directorChecksSchema = z
  .object(
    Object.fromEntries(DIRECTOR_CHECK_NAMES.map((name) => [name, directorCheckSchema])) as Record<
      DirectorCheckName,
      typeof directorCheckSchema
    >,
  )
  .strict();

export const directorReviewSchema = z
  .object({
    recommendation: z.enum(DIRECTOR_RECOMMENDATIONS),
    summary: nonEmptyText,
    checks: directorChecksSchema,
    revisionInstructions: nonEmptyText.nullable(),
  })
  .strict();
