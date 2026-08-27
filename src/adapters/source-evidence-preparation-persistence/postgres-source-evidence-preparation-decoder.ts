import {
  sourceEvidencePreparationSchema,
  type SourceEvidencePreparation,
} from "@/domain/editorial";

export function decodePostgresSourceEvidencePreparation(
  payload: unknown,
  invariantError: () => Error,
): SourceEvidencePreparation {
  const parsed = sourceEvidencePreparationSchema.safeParse(payload);
  if (!parsed.success) throw invariantError();
  return structuredClone(parsed.data) as unknown as SourceEvidencePreparation;
}
