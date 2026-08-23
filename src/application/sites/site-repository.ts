import type { Site, SiteId } from "@/domain/editorial";

/**
 * Reading Sites is separate from creating them, and only reading exists yet.
 *
 * A Site is the boundary every other repository is scoped by, so it cannot itself be scoped by
 * one. Keeping the port read-only means the single Site an installation starts with can only
 * come from a migration, and no request path can conjure a tenant into existence.
 */
export interface SiteRepository {
  findById(id: SiteId): Promise<Site | null>;
  list(): Promise<readonly Site[]>;
}
