# ADR 0002: TypeScript application toolchain

- **Date:** 2026-08-08
- **Status:** Accepted

## Context

StoryRail needs an executable foundation before editorial-domain behavior is introduced. The first product slice is operated through one cohesive web interface, and its application boundaries are not yet mature enough to justify independently deployed services or multiple packages. The toolchain must support strict types, focused user-facing tests, consistent source style, and straightforward local operation without preselecting deferred infrastructure.

## Decision

StoryRail begins as one private, full-stack Next.js application using the App Router. React and strict TypeScript are used end-to-end so UI, server-side application code, and future shared contracts can evolve with one type system. Editorial-domain code must remain separate from UI and framework concerns when it is added.

The initial pinned toolchain is:

- Node.js 24.18.0, constrained to the Node 24 release line;
- pnpm 11.20.0 with a committed lockfile;
- Next.js 16.3.0 with React and React DOM 19.2.8;
- TypeScript 6.0.3;
- ESLint 9.39.5 with `eslint-config-next` 16.3.0 and flat configuration;
- Prettier 3.9.6;
- Vitest 4.1.10 with jsdom 30.0.1 and `@vitejs/plugin-react` 6.0.5; and
- React Testing Library 16.3.2, DOM Testing Library 10.4.1, and jest-dom 7.0.0.

pnpm provides fast, deterministic dependency installation with strict dependency boundaries. Dependency lifecycle scripts are denied unless explicitly reviewed. Approved scripts belong in the committed `pnpm-workspace.yaml` `allowBuilds` map and use exact package versions so new or upgraded scripts fail closed pending separate review. ESLint covers correctness and Next.js-specific rules, while Prettier owns mechanical formatting. Vitest supplies a fast TypeScript-aware test runner, and its React plugin handles TSX through the automatic JSX runtime required by Next.js. jsdom and React Testing Library support focused tests expressed through visible, accessible behavior rather than component internals.

## Consequences

Application development has one install, one script surface, and one deployment unit. The committed lockfile and pinned package manager make dependency resolution reproducible. Framework code can initially coordinate full-stack behavior without a network boundary, while separation of domain code preserves a later path to other processes or services if evidence supports it.

This choice couples the first application shell to Next.js and requires deliberate internal boundaries. It does not change ADR 0001: StoryRail remains an editorial control plane rather than a page-building CMS.

## Alternatives considered

- **Monorepo:** Deferred because there is only one application and no proven independently versioned package boundary.
- **Separately deployed API:** Deferred because a network boundary would add contracts and operations before the application behavior is established.
- **Worker or queue service:** Deferred because no background-work requirements have been implemented or measured.
- **JavaScript without strict TypeScript:** Rejected because editorial transitions, structured agent outputs, and adapter contracts will benefit from end-to-end static types.
- **Tailwind or a component library:** Deferred because the foundation needs only a minimal page and plain CSS avoids selecting a UI system prematurely.

## Follow-up decisions

Later batches and ADRs will address the editorial domain, database and migrations, authentication, queues, agents, model providers, extraction adapters, publishing adapters, UI libraries, deployment, and continuous integration. None of those systems is selected or introduced by this decision.
