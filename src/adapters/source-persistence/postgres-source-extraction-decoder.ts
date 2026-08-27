import { sourceExtractionSchema, type SourceExtraction } from "@/domain/editorial";

export function decodePostgresSourceExtraction(
  payload: unknown,
  invariantError: () => Error,
): SourceExtraction {
  const parsed = sourceExtractionSchema.safeParse(payload);
  if (!parsed.success) throw invariantError();
  return structuredClone(parsed.data) as unknown as SourceExtraction;
}
