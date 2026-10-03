BEGIN;

-- A publication brief is an optional structured addition to the existing append-only standards
-- revision. Text-only historical rows remain valid and retain their original payload shape.
ALTER TABLE storyrail.newsroom_standards
  DROP CONSTRAINT newsroom_standards_payload_check,
  ADD CONSTRAINT newsroom_standards_payload_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id', 'revisionNumber', 'text', 'updatedBy', 'updatedAt']
    AND payload - ARRAY['id', 'revisionNumber', 'text', 'updatedBy', 'updatedAt', 'brief'] = '{}'::jsonb
    AND payload ->> 'id' = standards_id
    AND (payload ->> 'revisionNumber')::integer = revision_number
    AND jsonb_typeof(payload -> 'text') = 'string'
    AND payload ->> 'text' = btrim(payload ->> 'text')
    AND length(payload ->> 'text') <= 8000
    AND payload -> 'updatedBy' = jsonb_build_object(
      'type', 'operator', 'operatorId', payload -> 'updatedBy' -> 'operatorId'
    )
    AND jsonb_typeof(payload -> 'updatedBy' -> 'operatorId') = 'string'
    AND btrim(payload -> 'updatedBy' ->> 'operatorId') <> ''
    AND jsonb_typeof(payload -> 'updatedAt') = 'string'
    AND btrim(payload ->> 'updatedAt') <> ''
    AND (
      (btrim(payload ->> 'text') <> '' OR payload ? 'brief') AND
      (NOT (payload ? 'brief') OR (
        jsonb_typeof(payload -> 'brief') = 'object'
        AND payload -> 'brief' ?& ARRAY['audience', 'readerBenefit', 'coverageCriteria', 'voice', 'avoid']
        AND (payload -> 'brief') - ARRAY['audience', 'readerBenefit', 'coverageCriteria', 'voice', 'avoid'] = '{}'::jsonb
        AND jsonb_typeof(payload -> 'brief' -> 'audience') = 'string'
        AND btrim(payload -> 'brief' ->> 'audience') <> ''
        AND jsonb_typeof(payload -> 'brief' -> 'readerBenefit') = 'string'
        AND btrim(payload -> 'brief' ->> 'readerBenefit') <> ''
        AND jsonb_typeof(payload -> 'brief' -> 'coverageCriteria') = 'string'
        AND jsonb_typeof(payload -> 'brief' -> 'voice') = 'string'
        AND jsonb_typeof(payload -> 'brief' -> 'avoid') = 'string'
        AND length(payload -> 'brief' ->> 'audience') <= 2000
        AND length(payload -> 'brief' ->> 'readerBenefit') <= 2000
        AND length(payload -> 'brief' ->> 'coverageCriteria') <= 2000
        AND length(payload -> 'brief' ->> 'voice') <= 2000
        AND length(payload -> 'brief' ->> 'avoid') <= 2000
      ))
    )
  );

COMMIT;
