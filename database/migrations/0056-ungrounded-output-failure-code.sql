BEGIN;

-- A Writer can return a perfectly well-formed draft whose claims cite evidence that does not
-- contain what they quote. That is not a malformed response and recording it as
-- MODEL_OUTPUT_INVALID would send the operator looking for a schema problem that is not there.
-- MODEL_OUTPUT_UNGROUNDED names what actually happened: the model answered correctly and the
-- answer was not supported.
--
-- Extracting this list into a function in 0053 was meant to make the next code a one-line
-- change. It was.

-- A refusal that says only that it refused leaves the operator exactly the opacity citations
-- were introduced to remove, so a grounding failure also records which citations could not be
-- supported. Findings belong to that code alone and are meaningless attached to any other.

CREATE FUNCTION storyrail.grounding_finding_is_valid(finding jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(finding) = 'object'
    AND finding ?& ARRAY['blockIndex', 'citationIndex', 'code', 'quote', 'evidenceId']
    AND finding - ARRAY['blockIndex', 'citationIndex', 'code', 'quote', 'evidenceId'] = '{}'::jsonb
    AND jsonb_typeof(finding -> 'blockIndex') = 'number'
    AND (finding ->> 'blockIndex')::numeric >= 0
    AND jsonb_typeof(finding -> 'citationIndex') = 'number'
    AND (finding ->> 'citationIndex')::numeric >= 0
    AND finding ->> 'code' IN (
      'CITATION_EVIDENCE_UNKNOWN',
      'CITATION_SOURCE_MISMATCH',
      'CITATION_QUOTE_UNSUPPORTED'
    )
    AND jsonb_typeof(finding -> 'quote') = 'string'
    AND btrim(finding ->> 'quote') <> ''
    AND jsonb_typeof(finding -> 'evidenceId') = 'string'
    AND btrim(finding ->> 'evidenceId') <> '';
$$;

CREATE OR REPLACE FUNCTION storyrail.model_failure_is_valid(failure jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(failure) = 'object'
    AND failure ?& ARRAY['code', 'retryable']
    AND failure - ARRAY['code', 'retryable', 'findings'] = '{}'::jsonb
    AND failure ->> 'code' IN (
      'MODEL_AUTHENTICATION_FAILED',
      'MODEL_QUOTA_EXHAUSTED',
      'MODEL_REQUEST_TIMED_OUT',
      'MODEL_REQUEST_FAILED',
      'MODEL_RESPONSE_REJECTED',
      'MODEL_OUTPUT_INVALID',
      'MODEL_OUTPUT_UNGROUNDED'
    )
    AND jsonb_typeof(failure -> 'retryable') = 'boolean'
    AND (
      NOT failure ? 'findings'
      OR (
        failure ->> 'code' = 'MODEL_OUTPUT_UNGROUNDED'
        AND jsonb_typeof(failure -> 'findings') = 'array'
        AND jsonb_array_length(failure -> 'findings') > 0
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(failure -> 'findings') AS found(finding)
          WHERE NOT storyrail.grounding_finding_is_valid(found.finding)
        )
      )
    );
$$;

COMMIT;
