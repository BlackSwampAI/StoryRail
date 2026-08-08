# ADR 0006: Source URL intake

- **Date:** 2026-08-08
- **Status:** Accepted

## Context

ADR 0001 separates preserved Sources from editorial Stories and versioned Articles. The MVP begins with a manually submitted URL, but URL intake needs a deterministic domain boundary before retrieval, extraction, persistence, application routes, or user interfaces are introduced. That boundary must preserve the evidence supplied by an operator or bounded agent without allowing incidental URL presentation differences to create obvious duplicate Source identities.

URL normalization is easy to make too aggressive. Different schemes, paths, query parameters, or trailing slashes can identify different resources. Conversely, fragments, default ports, hostname casing, and common campaign parameters need not create separate Source records. The initial rule therefore needs to be explicit, conservative, and independent of claims that two resources contain the same material or cover the same event.

## Decision

StoryRail implements pure, framework-independent URL Source intake under `src/domain/editorial`. A successful intake creates a readonly URL Source record containing its caller-supplied `SourceId`, a URL Source discriminator, the exact submitted URL, a branded canonical Source URL, the attributable `EditorialActor`, and the caller-supplied received timestamp. The domain does not generate identity, time, randomness, or any other command fact.

The exact submitted URL and canonical URL are both retained for different purposes. The submitted value preserves what the caller provided for provenance and later inspection, including surrounding whitespace. The canonical value provides a deliberately narrow comparison key without replacing or rewriting that evidence.

Canonicalization uses the platform `URL` parser and applies these rules:

- submitted URLs may contain at most 2,048 characters;
- surrounding whitespace is trimmed for parsing and canonicalization but retained in the submitted value;
- only absolute HTTP and HTTPS URLs are accepted, and those schemes remain distinct;
- platform serialization normalizes protocol and hostname casing, internationalized hostnames, and default ports;
- embedded usernames or passwords are rejected;
- fragments are removed;
- parameter names are compared case-insensitively, and every `utm_` parameter plus `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`, and `mc_eid` is removed;
- all other query parameters, values, repetitions, and relative ordering are preserved;
- an empty query delimiter left by tracking-parameter removal is removed; and
- `www`, paths, path casing, trailing slashes, non-default ports, unknown query parameters, and HTTP-versus-HTTPS distinctions are otherwise preserved.

Normal validation and duplicate outcomes are discriminated results rather than exceptions. Their stable codes are `SOURCE_URL_REQUIRED`, `SOURCE_URL_TOO_LONG`, `INVALID_SOURCE_URL`, `UNSUPPORTED_SOURCE_PROTOCOL`, `SOURCE_URL_CREDENTIALS_NOT_ALLOWED`, and `DUPLICATE_SOURCE`. Messages do not reproduce submitted URLs, credentials, or query material. A duplicate result includes only the required structured match context: the existing `SourceId` and matched canonical URL.

Duplicate Source means exact equality between canonical URL values. Intake scans the supplied existing URL Sources in their given order and reports the first match, surfacing its existing identity instead of creating another Source. The command, actor, collection, and existing records remain unchanged. This in-memory scan expresses the domain rule only; future persistence must enforce canonical URL uniqueness atomically so concurrent intake commands cannot create duplicate Sources.

Semantic duplicate detection is deferred. Mirrored or syndicated articles, differently shaped URLs with equivalent content, and multiple Sources about the same real-world event are not duplicate Sources under this decision. Evaluating whether Sources support the same Story is a later editorial capability, not URL canonicalization.

Retrieval and extraction are also deferred. Parsing a URL does not perform DNS resolution, redirects, private-address checks, robots evaluation, SSRF protection, or any network-safety validation, and this decision makes no network-safety claim. Future extraction adapters will receive the already preserved Source and return extraction information; they will not own or replace Source identity.

## Consequences

Manual URL intake can be tested without Next.js, storage, networking, agents, or clocks. Provenance remains inspectable while obvious canonical matches receive deterministic duplicate handling. The branded canonical URL reduces accidental substitution with Source, Story, or unvalidated string identities.

The deliberately limited policy will retain some URLs that later evidence may show are equivalent. That is preferable to silently merging distinct evidence. Application and persistence layers must still authorize actors, store records, enforce atomic uniqueness, and establish network-safety controls before any URL is retrieved.

## Alternatives considered

- **Store only the canonical URL:** Rejected because normalization would erase the exact evidence submitted by the caller.
- **Store only the submitted URL:** Rejected because obvious presentation and campaign differences would create avoidable duplicate Sources.
- **Aggressive URL normalization:** Rejected because scheme, `www`, path, trailing-slash, and functional-query changes may alter resource identity.
- **Content hashes, embeddings, or semantic similarity:** Deferred because they require retrieval or model-dependent evidence and answer a broader question than exact Source identity.
- **Retrieval during intake:** Rejected because Source identity and provenance must exist independently of a replaceable extraction adapter or network outcome.
- **In-memory scanning as the persistence strategy:** Rejected because it cannot enforce uniqueness atomically across concurrent writers.
