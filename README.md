# StoryRail

> Turn raw sources into researched, reviewed, publishable stories through a visible agentic editorial workflow.

**Status: pre-alpha. StoryRail is not ready for production use.** This repository currently defines the product direction and decision framework; it does not claim an implemented application.

## Why StoryRail

Small publishers need more than a stream of links or an opaque text generator. They need a durable editorial process that preserves evidence, makes automated work reviewable, and keeps publication under human control. StoryRail is an agent-first editorial control plane for that process, not a page-building CMS.

The core terms are deliberately separate:

- A **Source** is preserved evidence or input, such as a URL and its extracted contents.
- A **Story** is an editorial object used to assess, organize, assign, and track a possible piece of coverage.
- An **Article** is a versioned editorial work product that may be reviewed and eventually published.

Multiple sources can inform one story, and a story can be rejected or merged without ever becoming an article.

## Editorial lifecycle

StoryRail's intended lifecycle is: preserve sources, form a story, create an assignment, research and draft, review claims and prose, request bounded revisions, approve or reject, then publish or export through an explicit action.

## Core principles

- Human operators supervise exceptions and exercise editorial judgment.
- Originality, evidence, and provenance matter throughout the workflow.
- Automation is bounded, observable, and auditable.
- Editorial state is explicit and durable.
- Models, source extractors, and publication targets remain replaceable.
- Publishing is headless and API-oriented rather than tied to page building.

## Documentation

- [Product vision](docs/product/vision.md)
- [Terminology and invariants](docs/product/terminology.md)
- [MVP vertical slice](docs/product/mvp.md)
- [Architecture decisions](docs/architecture/README.md)
- [ADR 0001: Editorial control plane](docs/architecture/adr-0001-editorial-control-plane.md)
- [Contributing](CONTRIBUTING.md)

## License

StoryRail is licensed under the [GNU Affero General Public License version 3](LICENSE).
