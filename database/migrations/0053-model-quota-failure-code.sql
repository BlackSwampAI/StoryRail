BEGIN;

-- A provider can refuse a request because the account reached a billing or quota limit while
-- the credential itself is perfectly valid. That was previously recorded as
-- MODEL_RESPONSE_REJECTED, which points the operator at the model rather than at the account
-- they control. MODEL_QUOTA_EXHAUSTED names it accurately.
--
-- The permitted failure codes were spelled out inline inside
-- agent_runs_payload_outcome_check, so widening them meant re-declaring a forty-line
-- constraint. Extract the check into a function, following the existing
-- storyrail.director_review_is_valid precedent, so the next code added is a one-line change.

CREATE OR REPLACE FUNCTION storyrail.model_failure_is_valid(failure jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(failure) = 'object'
    AND failure ?& ARRAY['code', 'retryable']
    AND failure - ARRAY['code', 'retryable'] = '{}'::jsonb
    AND failure ->> 'code' IN (
      'MODEL_AUTHENTICATION_FAILED',
      'MODEL_QUOTA_EXHAUSTED',
      'MODEL_REQUEST_TIMED_OUT',
      'MODEL_REQUEST_FAILED',
      'MODEL_RESPONSE_REJECTED',
      'MODEL_OUTPUT_INVALID'
    )
    AND jsonb_typeof(failure -> 'retryable') = 'boolean';
$$;

ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_payload_outcome_check;

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_payload_outcome_check CHECK (
    (role = 'assignment_editor' AND outcome = 'succeeded'
     AND jsonb_typeof(payload -> 'proposal') = 'object'
     AND (payload -> 'proposal') ?& ARRAY['writerProfileId','angle','brief','constraints','reason']
     AND (payload -> 'proposal') - ARRAY['writerProfileId','angle','brief','constraints','reason'] = '{}'::jsonb
     AND jsonb_typeof(payload -> 'proposal' -> 'writerProfileId') = 'string'
     AND btrim(payload -> 'proposal' ->> 'writerProfileId') <> ''
     AND payload -> 'proposal' ->> 'writerProfileId' = btrim(payload -> 'proposal' ->> 'writerProfileId')
     AND (payload -> 'input' -> 'writerProfileIds') ? (payload -> 'proposal' ->> 'writerProfileId')
     AND jsonb_typeof(payload -> 'proposal' -> 'angle') = 'string'
     AND btrim(payload -> 'proposal' ->> 'angle') <> ''
     AND payload -> 'proposal' ->> 'angle' = btrim(payload -> 'proposal' ->> 'angle')
     AND jsonb_typeof(payload -> 'proposal' -> 'brief') = 'string'
     AND btrim(payload -> 'proposal' ->> 'brief') <> ''
     AND payload -> 'proposal' ->> 'brief' = btrim(payload -> 'proposal' ->> 'brief')
     AND (jsonb_typeof(payload -> 'proposal' -> 'constraints') = 'null'
       OR (jsonb_typeof(payload -> 'proposal' -> 'constraints') = 'string'
         AND btrim(payload -> 'proposal' ->> 'constraints') <> ''
         AND payload -> 'proposal' ->> 'constraints' = btrim(payload -> 'proposal' ->> 'constraints')))
     AND jsonb_typeof(payload -> 'proposal' -> 'reason') = 'string'
     AND btrim(payload -> 'proposal' ->> 'reason') <> ''
     AND payload -> 'proposal' ->> 'reason' = btrim(payload -> 'proposal' ->> 'reason'))
    OR (role = 'writer' AND outcome = 'succeeded'
     AND jsonb_typeof(payload -> 'articleId') = 'string'
     AND btrim(payload ->> 'articleId') <> ''
     AND payload ->> 'articleId' = btrim(payload ->> 'articleId')
     AND jsonb_typeof(payload -> 'revisionId') = 'string'
     AND btrim(payload ->> 'revisionId') <> ''
     AND payload ->> 'revisionId' = btrim(payload ->> 'revisionId'))
    OR (role = 'editor_in_chief' AND outcome = 'succeeded'
     AND storyrail.director_review_is_valid(payload -> 'review'))
    OR (outcome = 'failed'
     AND storyrail.model_failure_is_valid(payload -> 'failure'))
  );

COMMIT;
