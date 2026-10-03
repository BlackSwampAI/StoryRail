import type {
  EditorialContextSnapshot,
  NewsroomIdentity,
  NewsroomStandards,
} from "@/domain/editorial";

export interface EditorialContextReaders {
  readonly readEditorialContext?: () => Promise<EditorialContextSnapshot>;
  readonly readNewsroomStandards?: () => Promise<string | null>;
  readonly readNewsroomIdentity?: () => Promise<NewsroomIdentity | null>;
}

export interface ResolvedEditorialContext {
  readonly snapshot?: EditorialContextSnapshot;
  readonly standards: string | NewsroomStandards | null;
  readonly identity: NewsroomIdentity | null;
}

/** Read once before a run is recorded, then use this same value for prompts and its audit input. */
export async function resolveEditorialContext(
  readers: EditorialContextReaders,
): Promise<ResolvedEditorialContext> {
  if (readers.readEditorialContext) {
    const snapshot = structuredClone(await readers.readEditorialContext());
    return { snapshot, standards: snapshot.standards, identity: snapshot.identity };
  }
  const [standards, identity] = await Promise.all([
    readers.readNewsroomStandards?.() ?? null,
    readers.readNewsroomIdentity?.() ?? null,
  ]);
  return { standards, identity };
}
