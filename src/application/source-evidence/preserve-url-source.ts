import {
  intakeUrlSource,
  type EditorialActor,
  type SourceId,
  type SourceIntakeError,
  type UrlSource,
} from "@/domain/editorial";

import type { SourceIdConflictError, UrlSourceRepository } from "../source-persistence";

export interface PreserveUrlSourceCommand {
  readonly submittedUrl: string;
  readonly submittedBy: EditorialActor;
}

export interface PreserveUrlSourceDependencies {
  readonly sourceRepository: UrlSourceRepository;
  readonly createSourceId: () => SourceId;
  readonly now: () => string;
}

export type PreserveUrlSourceResult =
  | {
      readonly ok: true;
      readonly source: UrlSource;
    }
  | {
      readonly ok: false;
      readonly error: SourceIntakeError | SourceIdConflictError;
    };

export type PreserveUrlSource = (
  command: PreserveUrlSourceCommand,
) => Promise<PreserveUrlSourceResult>;

export function createPreserveUrlSource(
  dependencies: PreserveUrlSourceDependencies,
): PreserveUrlSource {
  return async (command) => {
    const sourceId = dependencies.createSourceId();
    const receivedAt = dependencies.now();
    const intakeResult = intakeUrlSource(
      {
        sourceId,
        submittedUrl: command.submittedUrl,
        submittedBy: command.submittedBy,
        receivedAt,
      },
      [],
    );

    if (!intakeResult.ok) {
      return intakeResult;
    }

    return dependencies.sourceRepository.persist({ source: intakeResult.source });
  };
}
