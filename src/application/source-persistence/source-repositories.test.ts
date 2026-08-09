import { isDeepStrictEqual } from "node:util";

import type {
  CanonicalSourceUrl,
  SourceExtraction,
  SourceExtractionId,
  SourceId,
  UrlSource,
} from "@/domain/editorial";

import {
  describeSourceRepositoriesContract,
  type SourceRepositoriesContractHarness,
} from "./source-repositories.contract";
import type {
  AppendSourceExtractionCommand,
  AppendSourceExtractionResult,
  PersistUrlSourceCommand,
  PersistUrlSourceResult,
  SourceExtractionRepository,
  UrlSourceRepository,
} from "./source-repositories";

function snapshot<Value>(value: Value): Value {
  return structuredClone(value);
}

function createReferenceHarness(): SourceRepositoriesContractHarness {
  const sourcesById = new Map<SourceId, UrlSource>();
  const sourceIdsByCanonicalUrl = new Map<CanonicalSourceUrl, SourceId>();
  const extractionsById = new Map<SourceExtractionId, SourceExtraction>();
  const extractionAppendOrder: SourceExtractionId[] = [];

  const sources: UrlSourceRepository = {
    async persist(command: PersistUrlSourceCommand): Promise<PersistUrlSourceResult> {
      const existingById = sourcesById.get(command.source.id);

      if (existingById) {
        if (isDeepStrictEqual(existingById, command.source)) {
          return { ok: true, source: snapshot(existingById) };
        }

        return {
          ok: false,
          error: {
            code: "SOURCE_ID_CONFLICT",
            message: "A different Source with the same Source ID already exists.",
            sourceId: command.source.id,
          },
        };
      }

      const existingSourceId = sourceIdsByCanonicalUrl.get(command.source.canonicalUrl);

      if (existingSourceId) {
        return {
          ok: false,
          error: {
            code: "DUPLICATE_SOURCE",
            message: "A Source with the same canonical URL already exists.",
            existingSourceId,
            canonicalUrl: command.source.canonicalUrl,
          },
        };
      }

      const stored = snapshot(command.source);
      sourcesById.set(stored.id, stored);
      sourceIdsByCanonicalUrl.set(stored.canonicalUrl, stored.id);

      return { ok: true, source: snapshot(stored) };
    },

    async findById(sourceIdentity: SourceId): Promise<UrlSource | null> {
      const stored = sourcesById.get(sourceIdentity);
      return stored ? snapshot(stored) : null;
    },

    async findByCanonicalUrl(canonicalUrl: CanonicalSourceUrl): Promise<UrlSource | null> {
      const storedId = sourceIdsByCanonicalUrl.get(canonicalUrl);
      const stored = storedId ? sourcesById.get(storedId) : undefined;
      return stored ? snapshot(stored) : null;
    },
  };

  const extractions: SourceExtractionRepository = {
    async append(command: AppendSourceExtractionCommand): Promise<AppendSourceExtractionResult> {
      const existingById = extractionsById.get(command.extraction.id);

      if (existingById) {
        if (isDeepStrictEqual(existingById, command.extraction)) {
          return { ok: true, extraction: snapshot(existingById) };
        }

        return {
          ok: false,
          error: {
            code: "SOURCE_EXTRACTION_ID_CONFLICT",
            message: "A different Source extraction with the same extraction ID already exists.",
            extractionId: command.extraction.id,
          },
        };
      }

      if (!sourcesById.has(command.extraction.sourceId)) {
        return {
          ok: false,
          error: {
            code: "SOURCE_NOT_FOUND",
            message: "The Source referenced by the extraction does not exist.",
            sourceId: command.extraction.sourceId,
          },
        };
      }

      const stored = snapshot(command.extraction);
      extractionsById.set(stored.id, stored);
      extractionAppendOrder.push(stored.id);

      return { ok: true, extraction: snapshot(stored) };
    },

    async listBySourceId(sourceIdentity: SourceId): Promise<readonly SourceExtraction[]> {
      return extractionAppendOrder.flatMap((extractionIdentity) => {
        const stored = extractionsById.get(extractionIdentity);

        if (!stored || stored.sourceId !== sourceIdentity) {
          return [];
        }

        return [snapshot(stored)];
      });
    },
  };

  return { sources, extractions };
}

describeSourceRepositoriesContract(createReferenceHarness);
