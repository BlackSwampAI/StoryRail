BEGIN;

-- Autopilot sequenced its steps in memory. Every individual step was durable, but nothing
-- recorded that a Story was under a policy at all, so a process that died between two steps
-- left no trace of an automation to resume or abandon — and an AgentRun that was mid-model-call
-- stayed 'running' forever, with the workspace polling it indefinitely.
--
-- This record answers what the editorial history cannot: is something in flight, how far did it
-- get, and if the process driving it is gone, what should happen to it. The step is a moving
-- pointer rather than an append-only history because the history already exists in transition
-- receipts and agent runs; this is a coordination record, not a second copy of what happened.
--
-- Only one policy may be in flight for a Story at a time, and a settled run can never reopen.

CREATE TABLE storyrail.policy_runs (
  policy_run_id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES storyrail.stories (story_id),
  policy text NOT NULL,
  status text NOT NULL,
  step text NOT NULL,
  observed_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  append_position bigint GENERATED ALWAYS AS IDENTITY,
  CONSTRAINT policy_runs_policy_check CHECK (policy IN ('autopilot')),
  CONSTRAINT policy_runs_status_check CHECK (status IN ('running', 'settled')),
  CONSTRAINT policy_runs_step_check CHECK (
    step IN (
      'source_research','assignment_proposal','assignment','writer_draft','review_submission',
      'director_review','review_decision','writer_revision','publication'
    )
  ),
  CONSTRAINT policy_runs_payload_shape_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','storyId','policy','requestedBy','research','startedAt','step','observedAt','status']
    AND (
      (status = 'running'
       AND payload - ARRAY['id','storyId','policy','requestedBy','research','startedAt','step','observedAt','status'] = '{}'::jsonb)
      OR (status = 'settled'
       AND payload ?& ARRAY['conclusion','reason','completedAt']
       AND payload - ARRAY['id','storyId','policy','requestedBy','research','startedAt','step','observedAt','status','conclusion','reason','completedAt'] = '{}'::jsonb
       AND payload ->> 'conclusion' IN ('completed', 'stopped', 'abandoned')
       AND jsonb_typeof(payload -> 'reason') = 'string'
       AND btrim(payload ->> 'reason') <> ''
       AND jsonb_typeof(payload -> 'completedAt') = 'string'
       AND btrim(payload ->> 'completedAt') <> '')
    )
    AND payload ->> 'id' = policy_run_id
    AND payload ->> 'storyId' = story_id
    AND payload ->> 'policy' = policy
    AND payload ->> 'status' = status
    AND payload ->> 'step' = step
    AND jsonb_typeof(payload -> 'research') = 'boolean'
    AND payload -> 'requestedBy' = jsonb_build_object(
      'type', 'operator', 'operatorId', payload -> 'requestedBy' -> 'operatorId'
    )
    AND jsonb_typeof(payload -> 'requestedBy' -> 'operatorId') = 'string'
    AND btrim(payload -> 'requestedBy' ->> 'operatorId') <> ''
    AND jsonb_typeof(payload -> 'startedAt') = 'string'
    AND btrim(payload ->> 'startedAt') <> ''
  )
);

-- A Story may be under at most one policy at a time. Settled runs accumulate freely.
CREATE UNIQUE INDEX policy_runs_one_in_flight_per_story
  ON storyrail.policy_runs (story_id)
  WHERE status = 'running';

CREATE INDEX policy_runs_running_observed_at
  ON storyrail.policy_runs (observed_at)
  WHERE status = 'running';

-- Progress may move; a settled run is finished. The same append-only discipline AgentRuns got.
CREATE FUNCTION storyrail.policy_run_progress_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'settled' THEN
    RAISE EXCEPTION 'policy run % is already settled', OLD.policy_run_id
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.policy_run_id <> OLD.policy_run_id
    OR NEW.story_id <> OLD.story_id
    OR NEW.policy <> OLD.policy
    OR NEW.payload ->> 'startedAt' <> OLD.payload ->> 'startedAt'
    OR NEW.payload -> 'requestedBy' <> OLD.payload -> 'requestedBy'
  THEN
    RAISE EXCEPTION 'policy run % cannot change its identity', OLD.policy_run_id
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER policy_runs_progress_only
  BEFORE UPDATE ON storyrail.policy_runs
  FOR EACH ROW EXECUTE FUNCTION storyrail.policy_run_progress_only();

-- An AgentRun whose process disappeared mid-call is not a model failure. Naming it accurately
-- keeps an operator from looking for a provider problem that never happened.
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
      'MODEL_OUTPUT_UNGROUNDED',
      'MODEL_RUN_ABANDONED'
    )
    AND jsonb_typeof(failure -> 'retryable') = 'boolean'
    AND (
      NOT failure ? 'findings'
      OR (
        failure ->> 'code' = 'MODEL_OUTPUT_UNGROUNDED'
        AND storyrail.grounding_findings_are_valid(failure -> 'findings')
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
