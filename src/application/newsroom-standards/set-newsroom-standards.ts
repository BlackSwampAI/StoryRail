import {
  newsroomStandardsId,
  recordNewsroomStandards,
  type NewsroomStandards,
  type OperatorActor,
} from "@/domain/editorial";

import type { NewsroomStandardsRepository } from "./newsroom-standards-repository";

export type SetNewsroomStandardsResult =
  | { readonly ok: true; readonly standards: NewsroomStandards }
  | {
      readonly ok: false;
      readonly error: { readonly code: string; readonly message: string };
    };

/**
 * Writes a new revision of the newsroom's standards.
 *
 * Editing is appending: the previous revision stays readable, so a piece written last month can
 * still be explained by the standards that were in force when it was written.
 */
export function createSetNewsroomStandards(dependencies: {
  readonly repository: NewsroomStandardsRepository;
  readonly createUuid: () => string;
  readonly now: () => string;
}) {
  return async (command: {
    readonly text: string;
    readonly updatedBy: OperatorActor;
  }): Promise<SetNewsroomStandardsResult> => {
    const history = await dependencies.repository.list();
    const candidate = recordNewsroomStandards({
      id: newsroomStandardsId(dependencies.createUuid()),
      revisionNumber: (history.at(-1)?.revisionNumber ?? 0) + 1,
      text: command.text,
      updatedBy: command.updatedBy,
      updatedAt: dependencies.now(),
    });
    if (!candidate.ok) return candidate;
    const appended = await dependencies.repository.append(candidate.standards);
    return appended.ok ? { ok: true, standards: appended.standards } : appended;
  };
}
