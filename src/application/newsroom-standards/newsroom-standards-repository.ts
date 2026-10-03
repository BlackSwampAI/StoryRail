import type { NewsroomStandards } from "@/domain/editorial";

export type AppendNewsroomStandardsResult =
  | { readonly ok: true; readonly standards: NewsroomStandards }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "NEWSROOM_STANDARDS_REVISION_CONFLICT";
        readonly message: string;
      };
    };

/**
 * Standards are an append-only history. Older runs can be explained by the revision in force
 * at their start; new runs also snapshot the exact selected revision in their inputs.
 */
export interface NewsroomStandardsRepository {
  append(standards: NewsroomStandards): Promise<AppendNewsroomStandardsResult>;
  list(): Promise<readonly NewsroomStandards[]>;
}
