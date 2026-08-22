BEGIN;

-- The Director approved every Article it was ever shown. It was given the same evidence as the
-- Writer, asked for a status and a note, and had no way to be wrong, so it returned five passes
-- and generic praise.
--
-- Two changes give it something it can actually be held to. A sixth check, `support`, asks the
-- question mechanical verification cannot: a cited passage provably exists, but does the claim
-- built on it fairly follow from it? And every check must now quote the passage of the Article
-- it is judging, verified against that Article before the review is recorded — a reviewer that
-- must point at what it read cannot praise work it did not.

CREATE OR REPLACE FUNCTION storyrail.director_review_is_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['recommendation','summary','checks','revisionInstructions']
    AND value - ARRAY['recommendation','summary','checks','revisionInstructions'] = '{}'::jsonb
    AND value ->> 'recommendation' IN ('approve','request_changes')
    AND jsonb_typeof(value -> 'summary') = 'string'
    AND btrim(value ->> 'summary') <> ''
    AND value ->> 'summary' = btrim(value ->> 'summary')
    AND jsonb_typeof(value -> 'checks') = 'object'
    AND (value -> 'checks') ?& ARRAY['assignment','support','accuracy','headline','structure','style']
    AND (value -> 'checks') - ARRAY['assignment','support','accuracy','headline','structure','style'] = '{}'::jsonb
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(value -> 'checks') AS checks(name, item)
      WHERE jsonb_typeof(item) <> 'object'
        OR NOT item ?& ARRAY['status','note','quoted']
        OR item - ARRAY['status','note','quoted'] <> '{}'::jsonb
        OR item ->> 'status' NOT IN ('pass','needs_changes')
        OR jsonb_typeof(item -> 'note') <> 'string'
        OR btrim(item ->> 'note') = ''
        OR item ->> 'note' <> btrim(item ->> 'note')
        OR jsonb_typeof(item -> 'quoted') <> 'string'
        OR btrim(item ->> 'quoted') = ''
        OR item ->> 'quoted' <> btrim(item ->> 'quoted')
    )
    AND (
      (value ->> 'recommendation' = 'approve'
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_each(value -> 'checks') AS checks(name, item)
         WHERE item ->> 'status' <> 'pass'
       )
       AND jsonb_typeof(value -> 'revisionInstructions') = 'null')
      OR
      (value ->> 'recommendation' = 'request_changes'
       AND EXISTS (
         SELECT 1 FROM jsonb_each(value -> 'checks') AS checks(name, item)
         WHERE item ->> 'status' = 'needs_changes'
       )
       AND jsonb_typeof(value -> 'revisionInstructions') = 'string'
       AND btrim(value ->> 'revisionInstructions') <> ''
       AND value ->> 'revisionInstructions' = btrim(value ->> 'revisionInstructions'))
    )
$$;

-- A Director refusal that says only that it was refused leaves the operator unable to tell
-- which check quoted something the Article does not contain. The same lesson as the Writer's
-- findings, applied to the reviewer.

CREATE OR REPLACE FUNCTION storyrail.model_failure_is_valid(failure jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(failure) = 'object'
    AND failure ?& ARRAY['code', 'retryable']
    AND failure - ARRAY['code', 'retryable', 'findings', 'unsupportedChecks'] = '{}'::jsonb
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
    )
    AND (
      NOT failure ? 'unsupportedChecks'
      OR (
        failure ->> 'code' = 'MODEL_OUTPUT_UNGROUNDED'
        AND jsonb_typeof(failure -> 'unsupportedChecks') = 'array'
        AND jsonb_array_length(failure -> 'unsupportedChecks') > 0
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(failure -> 'unsupportedChecks') AS named(name)
          WHERE jsonb_typeof(named.name) <> 'string' OR btrim(named.name #>> '{}') = ''
        )
      )
    );
$$;

COMMIT;
