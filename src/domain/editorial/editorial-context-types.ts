import type { NewsroomStandards, NewsroomIdentity } from "./newsroom-standards-types";

/** The exact site identity and house revision used to start an agent run. */
export interface EditorialContextSnapshot {
  readonly identity: NewsroomIdentity | null;
  readonly standards: NewsroomStandards | null;
}
