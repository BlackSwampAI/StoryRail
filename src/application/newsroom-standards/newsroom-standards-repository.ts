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
 * Standards are an append-only history. Reading the whole history rather than only the current
 * revision is what lets a past run be explained: the standards a run worked under are the ones
 * that were current when it started.
 */
export interface NewsroomStandardsRepository {
  append(standards: NewsroomStandards): Promise<AppendNewsroomStandardsResult>;
  list(): Promise<readonly NewsroomStandards[]>;
}
