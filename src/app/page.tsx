import { redirect } from "next/navigation";

import { resolveLandingSiteId } from "@/runtime";
import { sitePagePath } from "@/features/newsroom/site-paths";

export const dynamic = "force-dynamic";

/**
 * A bookmark from before Sites could be switched still works: `/` sends the operator to the Site
 * this installation lands on rather than answering 404 to a URL that was correct yesterday.
 */
export default function HomePage() {
  redirect(sitePagePath(resolveLandingSiteId()));
}
