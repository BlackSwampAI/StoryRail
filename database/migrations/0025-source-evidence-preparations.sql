BEGIN;

ALTER TABLE storyrail.source_extractions
  ADD CONSTRAINT source_extractions_extraction_id_source_id_key
  UNIQUE (extraction_id, source_id);

CREATE TABLE storyrail.source_evidence_preparations (
  preparation_id text PRIMARY KEY,
  source_id text NOT NULL,
  extraction_id text NOT NULL,
  outcome text NOT NULL,
  payload jsonb NOT NULL,
  append_position bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT source_evidence_preparations_extraction_source_fkey
    FOREIGN KEY (extraction_id, source_id)
    REFERENCES storyrail.source_extractions (extraction_id, source_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT source_evidence_preparations_outcome_check
    CHECK (outcome IN ('succeeded', 'failed')),
  CONSTRAINT source_evidence_preparations_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT source_evidence_preparations_payload_identity_check
    CHECK (
      payload ? 'id'
      AND jsonb_typeof(payload -> 'id') = 'string'
      AND payload ->> 'id' = preparation_id
      AND payload ? 'sourceId'
      AND jsonb_typeof(payload -> 'sourceId') = 'string'
      AND payload ->> 'sourceId' = source_id
      AND payload ? 'extractionId'
      AND jsonb_typeof(payload -> 'extractionId') = 'string'
      AND payload ->> 'extractionId' = extraction_id
    ),
  CONSTRAINT source_evidence_preparations_payload_outcome_check
    CHECK (
      payload ? 'outcome'
      AND jsonb_typeof(payload -> 'outcome') = 'string'
      AND payload ->> 'outcome' = outcome
    ),
  CONSTRAINT source_evidence_preparations_payload_shape_check
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

CREATE INDEX source_evidence_preparations_source_id_append_position_idx
  ON storyrail.source_evidence_preparations (source_id, append_position);

CREATE INDEX source_evidence_preparations_extraction_id_append_position_idx
  ON storyrail.source_evidence_preparations (extraction_id, append_position);

COMMIT;
