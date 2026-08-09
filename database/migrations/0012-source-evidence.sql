BEGIN;

CREATE SCHEMA storyrail;

CREATE TABLE storyrail.url_sources (
  source_id text PRIMARY KEY,
  canonical_url text NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT url_sources_canonical_url_key UNIQUE (canonical_url),
  CONSTRAINT url_sources_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT url_sources_payload_id_check
    CHECK (
      payload ? 'id'
      AND jsonb_typeof(payload -> 'id') = 'string'
      AND payload ->> 'id' = source_id
    ),
  CONSTRAINT url_sources_payload_canonical_url_check
    CHECK (
      payload ? 'canonicalUrl'
      AND jsonb_typeof(payload -> 'canonicalUrl') = 'string'
      AND payload ->> 'canonicalUrl' = canonical_url
    ),
  CONSTRAINT url_sources_payload_type_check
    CHECK (
      payload ? 'type'
      AND jsonb_typeof(payload -> 'type') = 'string'
      AND payload ->> 'type' = 'url'
    )
);

CREATE TABLE storyrail.source_extractions (
  extraction_id text PRIMARY KEY,
  source_id text NOT NULL,
  outcome text NOT NULL,
  payload jsonb NOT NULL,
  append_position bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT source_extractions_source_id_fkey
    FOREIGN KEY (source_id)
    REFERENCES storyrail.url_sources (source_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT source_extractions_outcome_check
    CHECK (outcome IN ('succeeded', 'failed')),
  CONSTRAINT source_extractions_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT source_extractions_payload_id_check
    CHECK (
      payload ? 'id'
      AND jsonb_typeof(payload -> 'id') = 'string'
      AND payload ->> 'id' = extraction_id
    ),
  CONSTRAINT source_extractions_payload_source_id_check
    CHECK (
      payload ? 'sourceId'
      AND jsonb_typeof(payload -> 'sourceId') = 'string'
      AND payload ->> 'sourceId' = source_id
    ),
  CONSTRAINT source_extractions_payload_outcome_check
    CHECK (
      payload ? 'outcome'
      AND jsonb_typeof(payload -> 'outcome') = 'string'
      AND payload ->> 'outcome' = outcome
    ),
  CONSTRAINT source_extractions_payload_shape_check
    CHECK (
      (
        outcome = 'succeeded'
        AND payload ? 'document'
        AND NOT (payload ? 'failure')
      )
      OR
      (
        outcome = 'failed'
        AND payload ? 'failure'
        AND NOT (payload ? 'document')
      )
    )
);

CREATE INDEX source_extractions_source_id_append_position_idx
  ON storyrail.source_extractions (source_id, append_position);

COMMIT;
