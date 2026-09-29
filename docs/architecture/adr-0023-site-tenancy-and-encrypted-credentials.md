# ADR 0023: Site tenancy and encrypted per-Site credentials

- Date: 2026-08-23
- Status: Accepted

## Context

StoryRail assumed exactly one newsroom, so running a second website meant a second container and database. Connector credentials lived in the process environment, so two newsrooms in one installation could not use different provider accounts and the second would quietly spend the first one's money. A database that holds credentials can leak them, so they must not be stored readable.

## Decision

A Site is the tenant boundary (`0065-site-tenancy.sql`). The four editorial roots, Stories, URL Sources, newsroom standards, and Agent Profiles, carry a `site_id`, and every listing and lookup filters by it. Everything else descends from exactly one root and inherits its Site through that descent, so no further column is added. Where two roots meet directly, composite foreign keys make PostgreSQL check the pair, so a Story cannot attach a Source from another Site and an Assignment cannot use another Site's Writer Profile (`0065`, `0070-site-switching.sql`). Canonical URLs and revision numbers are unique within a Site rather than across the installation. Policy runs are tenant-scoped through their Story or Source root (ADR 0020).

Sites are visible and created in the product (`0070-site-switching.sql`), are addressed as `/api/sites/{siteId}/...`, and are identified by a unique hostname. `withSite` refuses an unknown Site before any runtime is built, and runtimes are cached per Site.

Connector credentials move into a per-Site encrypted store (`0066-site-credentials.sql`). They are encrypted with AES-256-GCM under `STORYRAIL_CREDENTIAL_KEY`, which stays in the environment so that reading the database cannot decrypt it. Authenticated data binds each ciphertext to its Site and slot, so a credential lifted to another Site or slot cannot be read. Only the last four characters are kept in the clear. Slots are open snake_case names, and the database constrains only the shape, including the nonce and tag lengths GCM requires. Non-secret configuration such as model choices, the delivery destination, search, and the Researcher budget sits in a plain per-Site settings payload (`0066`, `0068`, `0069`, `0071`, `0073`).

## Consequences

One installation can run several newsrooms with separate data, provider accounts, and destinations, and a cross-Site leak is refused by the database rather than merely avoided in code. A new installation has no credentials until an operator enters them, and browsing, intake, and Story creation work without any. Losing the credential key means every credential must be re-entered.

A Site is a tenant boundary and not a user or role model: there is still no authentication, and the operator identity is fixed.

## Rejected or deferred

- A tenant column on every table.
- Credentials in the environment or stored unencrypted.
- A closed database list of credential slots.
- Authentication, per-user access to a Site, and key rotation.
