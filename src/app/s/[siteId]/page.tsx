import { notFound } from "next/navigation";

import { siteId } from "@/domain/editorial";
import { NewsroomSiteProvider } from "@/features/newsroom/newsroom-clients";
import { NewsroomShell } from "@/features/newsroom/newsroom-shell";
import { siteDirectoryProvider } from "@/server/site-directory-provider";

export const dynamic = "force-dynamic";

export default async function SiteNewsroomPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>;
}) {
  const requested = siteId((await params).siteId);
  const directory = siteDirectoryProvider.get();
  const sites = await directory.listSites();
  const site = sites.find((candidate) => candidate.id === requested);

  // A Site that does not exist is a 404 here for the same reason it is one on the API: the page
  // would otherwise render a newsroom shell that could never load anything.
  if (site === undefined) {
    notFound();
  }

  return (
    <NewsroomSiteProvider site={site} sites={sites}>
      <NewsroomShell />
    </NewsroomSiteProvider>
  );
}
