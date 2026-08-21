BEGIN;

-- Evidence preparations now record how much of the raw extraction the model was shown.
-- Rows written before this migration predate the measurement and would otherwise fail to
-- decode, so they are reconstructed here rather than left unreadable.
--
-- The reconstruction is faithful: before this change the preparation workflow submitted the
-- entire extracted Markdown, so for every historical attempt the submitted length equals the
-- raw length. Both are taken from the extraction the preparation already references.
--
-- The statements are written to be idempotent so the migration can be reapplied safely.

UPDATE storyrail.source_evidence_preparations AS preparation
SET payload = preparation.payload || jsonb_build_object(
  'input',
  jsonb_build_object(
    'rawCharacters', COALESCE(measured.characters, 0),
    'submittedCharacters', COALESCE(measured.characters, 0)
  )
)
FROM (
  SELECT
    extraction.extraction_id,
    extraction.source_id,
    char_length(extraction.payload -> 'document' ->> 'content') AS characters
  FROM storyrail.source_extractions AS extraction
) AS measured
WHERE preparation.extraction_id = measured.extraction_id
  AND preparation.source_id = measured.source_id
  AND NOT preparation.payload ? 'input';

ALTER TABLE storyrail.source_evidence_preparations
  DROP CONSTRAINT IF EXISTS source_evidence_preparations_payload_input_check;

ALTER TABLE storyrail.source_evidence_preparations
  ADD CONSTRAINT source_evidence_preparations_payload_input_check
  CHECK (
    payload ? 'input'
    AND jsonb_typeof(payload -> 'input') = 'object'
    AND (payload -> 'input') ?& ARRAY['rawCharacters', 'submittedCharacters']
    AND ((payload -> 'input') - ARRAY['rawCharacters', 'submittedCharacters']) = '{}'::jsonb
    AND jsonb_typeof(payload -> 'input' -> 'rawCharacters') = 'number'
    AND jsonb_typeof(payload -> 'input' -> 'submittedCharacters') = 'number'
    AND (payload -> 'input' ->> 'rawCharacters')::numeric >= 0
    AND (payload -> 'input' ->> 'submittedCharacters')::numeric >= 0
    AND (payload -> 'input' ->> 'rawCharacters')::numeric
        = trunc((payload -> 'input' ->> 'rawCharacters')::numeric)
    AND (payload -> 'input' ->> 'submittedCharacters')::numeric
        = trunc((payload -> 'input' ->> 'submittedCharacters')::numeric)
    AND (payload -> 'input' ->> 'submittedCharacters')::numeric
        <= (payload -> 'input' ->> 'rawCharacters')::numeric
  );

COMMIT;
