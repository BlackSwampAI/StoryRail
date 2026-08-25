import {
  createCreateSiteHttpHandler,
  createListSitesHttpHandler,
} from "@/interfaces/http/site-handlers";
import { siteDirectoryProvider } from "@/server/site-directory-provider";

export const runtime = "nodejs";

// The only routes above a Site rather than inside one, which is why they carry no `[siteId]`.
export const GET = createListSitesHttpHandler({ getDirectory: siteDirectoryProvider.get });
export const POST = createCreateSiteHttpHandler({
  getDirectory: siteDirectoryProvider.get,
  onSiteCreated: siteDirectoryProvider.remember,
});
