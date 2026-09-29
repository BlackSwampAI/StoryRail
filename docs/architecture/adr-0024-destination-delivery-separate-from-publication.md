# ADR 0024: Destination delivery separate from publication

- Date: 2026-08-25
- Status: Accepted

## Context

Publication declares that a Story is ready to go and never said where it went. Sending an Article to a website is the first time StoryRail writes outside its own database, and it can fail without unmaking the editorial decision. It must not be folded into the publication transition.

## Decision

Delivery is a separate, durable workflow that applies only to a published Story with an Article (`0067-story-deliveries.sql`). The delivery row is written as a running intention before anything leaves the process and completes exactly once, following ADR 0021. The credential is resolved first, because work that was never attempted is not recorded. Nothing is retried: a failed delivery stays failed and a new delivery is a new row.

Destinations are replaceable adapters behind one `DeliveryDestination` port. WordPress (through the core REST API, with the Article rendered as Gutenberg blocks) and StudioCMS are implemented. Each Site has at most one destination, stored with an explicit `kind` rather than inferred from its fields (`0068-destination-settings.sql`, `0069-destination-kind.sql`). Its secret lives in the encrypted credential store (ADR 0023). A later Revision updates the page of the prior successful delivery rather than creating a second, and StoryRail never adopts a page it did not create by asking the remote what exists.

A connector name identifies software, not an installation. Each new delivery is bound to a destination instance derived from the connector kind and base URL, and a remote identifier is reused only for the same instance (`0076-story-delivery-instance-identity.sql`). Older deliveries have no instance, so an operator must confirm or dismiss the legacy mapping, recorded as an immutable append-only resolution, before it is used (`0077-legacy-delivery-mapping-resolutions.sql`).

A request can leave StoryRail without a trustworthy response. That is recorded as a terminal `unknown` outcome rather than success or failure, because retrying a create could duplicate a page and treating an update as failed could hide an accepted change (`0078-ambiguous-delivery-reconciliation.sql`). A further delivery is blocked until an operator records an immutable reconciliation decision for that exact attempt and instance.

## Consequences

Publication stays a pure editorial decision, and a delivery failure is preserved without changing the Story. Duplicate and misdirected pages are prevented by requiring operator judgment wherever the outcome or the target is uncertain, at the cost of a manual step. Autopilot delivers after publishing when a destination is configured.

A Site has one destination. The abandoned-work pass (ADR 0022) does not close a delivery left running by a dead process.

## Rejected or deferred

- Delivering as part of the publication transition.
- Automatic retry or discovering existing remote pages.
- Several destinations per Site, where partial failure would be routine.
- Trusting a legacy connector-name mapping without confirmation.
