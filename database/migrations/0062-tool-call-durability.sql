BEGIN;

-- A tool call was written after the external call returned. Reaching outside the system is
-- exactly the act that must not be able to happen unrecorded: a process that died mid-retrieval
-- had already retrieved something and left no trace of it, and a failure to write the record was
-- ignored while the result was still handed to the model.
--
-- Tool calls now carry the same running → succeeded|failed semantics AgentRuns already had. The
-- intent is durable before the call, the outcome is written after, and the exchange stops when
-- either write fails.

ALTER TABLE storyrail.agent_tool_calls
  DROP CONSTRAINT agent_tool_calls_outcome_check,
  DROP CONSTRAINT agent_tool_calls_payload_shape_check,
  DROP CONSTRAINT agent_tool_calls_failure_check;

ALTER TABLE storyrail.agent_tool_calls
  ADD CONSTRAINT agent_tool_calls_outcome_check
    CHECK (outcome IN ('running', 'succeeded', 'failed')),
  ADD CONSTRAINT agent_tool_calls_payload_shape_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','runId','storyId','sequence','tool','request','requestedAt','completedAt','outcome']
    AND (
      (outcome = 'running'
       AND jsonb_typeof(payload -> 'completedAt') = 'null'
       AND payload - ARRAY['id','runId','storyId','sequence','tool','request','requestedAt','completedAt','outcome'] = '{}'::jsonb)
      OR (outcome = 'succeeded'
       AND payload ? 'result'
       AND payload - ARRAY['id','runId','storyId','sequence','tool','request','requestedAt','completedAt','outcome','result'] = '{}'::jsonb)
      OR (outcome = 'failed'
       AND payload ? 'failure'
       AND payload - ARRAY['id','runId','storyId','sequence','tool','request','requestedAt','completedAt','outcome','failure'] = '{}'::jsonb)
    )
    AND payload ->> 'id' = tool_call_id
    AND payload ->> 'runId' = run_id
    AND payload ->> 'storyId' = story_id
    AND (payload ->> 'sequence')::integer = sequence
    AND payload ->> 'tool' = tool
    AND payload ->> 'outcome' = outcome
    AND jsonb_typeof(payload -> 'request') = 'object'
    AND jsonb_typeof(payload -> 'requestedAt') = 'string'
    AND btrim(payload ->> 'requestedAt') <> ''
    AND (
      outcome = 'running'
      OR (jsonb_typeof(payload -> 'completedAt') = 'string' AND btrim(payload ->> 'completedAt') <> '')
    )
    AND length(payload -> 'request' #>> '{}') <= 4000
    AND (NOT payload ? 'result' OR length(payload -> 'result' #>> '{}') <= 4000)
  ),
  ADD CONSTRAINT agent_tool_calls_failure_check CHECK (
    outcome <> 'failed'
    OR (
      jsonb_typeof(payload -> 'failure') = 'object'
      AND (payload -> 'failure') ?& ARRAY['code','retryable','message']
      AND (payload -> 'failure') - ARRAY['code','retryable','message'] = '{}'::jsonb
      AND payload -> 'failure' ->> 'code' IN (
        'TOOL_RUN_ABANDONED',
        'TOOL_NOT_AVAILABLE',
        'TOOL_REQUEST_INVALID',
        'TOOL_TARGET_REFUSED',
        'TOOL_EXECUTION_FAILED',
        'TOOL_BUDGET_EXHAUSTED'
      )
      AND jsonb_typeof(payload -> 'failure' -> 'retryable') = 'boolean'
      AND (
        jsonb_typeof(payload -> 'failure' -> 'message') = 'null'
        OR (
          jsonb_typeof(payload -> 'failure' -> 'message') = 'string'
          AND btrim(payload -> 'failure' ->> 'message') <> ''
        )
      )
    )
  );

-- A tool call completes exactly once and never reopens, as an AgentRun does.
CREATE FUNCTION storyrail.agent_tool_call_completes_once()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.outcome <> 'running' THEN
    RAISE EXCEPTION 'tool call % is already complete', OLD.tool_call_id
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.outcome = 'running' THEN
    RAISE EXCEPTION 'tool call % cannot return to running', OLD.tool_call_id
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.tool_call_id <> OLD.tool_call_id
    OR NEW.run_id <> OLD.run_id
    OR NEW.story_id <> OLD.story_id
    OR NEW.sequence <> OLD.sequence
    OR NEW.tool <> OLD.tool
    OR NEW.payload -> 'request' <> OLD.payload -> 'request'
    OR NEW.payload ->> 'requestedAt' <> OLD.payload ->> 'requestedAt'
  THEN
    RAISE EXCEPTION 'tool call % cannot change what it asked for', OLD.tool_call_id
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_tool_calls_completes_once
  BEFORE UPDATE ON storyrail.agent_tool_calls
  FOR EACH ROW EXECUTE FUNCTION storyrail.agent_tool_call_completes_once();

-- A correction turn that rewrote work nobody objected to is refused. The draft is still refused
-- for its original citations; this code says the correction was why it could not be taken.
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
      'MODEL_RUN_ABANDONED',
      'MODEL_CORRECTION_OUT_OF_SCOPE'
    )
    AND jsonb_typeof(failure -> 'retryable') = 'boolean'
    AND (
      NOT failure ? 'findings'
      OR (
        failure ->> 'code' IN ('MODEL_OUTPUT_UNGROUNDED', 'MODEL_CORRECTION_OUT_OF_SCOPE')
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
