BEGIN;

-- Agents had no way to reach outside the evidence they were handed, which is why every Story so
-- far rests on a single Source. Tools change that, and a tool call is exactly the kind of thing
-- that must not be taken on trust: it is recorded as it happens, so a run that dies part-way
-- still shows what it had already reached for.
--
-- The record is an audit fact, not a content store. What a tool retrieves becomes evidence with
-- its own immutable record; copying it here would leave two versions of the same material and no
-- way to say which was authoritative. Both the arguments and the recorded result are therefore
-- bounded in size.
--
-- Which tools exist is an operator's decision, so `tool` is an open name rather than a closed
-- list. The database records what was called; it does not decide what may be.

CREATE TABLE storyrail.agent_tool_calls (
  tool_call_id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES storyrail.agent_runs (run_id),
  story_id text NOT NULL REFERENCES storyrail.stories (story_id),
  sequence integer NOT NULL,
  tool text NOT NULL,
  outcome text NOT NULL,
  payload jsonb NOT NULL,
  append_position bigint GENERATED ALWAYS AS IDENTITY,
  CONSTRAINT agent_tool_calls_run_sequence_key UNIQUE (run_id, sequence),
  CONSTRAINT agent_tool_calls_sequence_check CHECK (sequence >= 1),
  CONSTRAINT agent_tool_calls_tool_check CHECK (btrim(tool) <> '' AND tool = btrim(tool)),
  CONSTRAINT agent_tool_calls_outcome_check CHECK (outcome IN ('succeeded', 'failed')),
  CONSTRAINT agent_tool_calls_payload_shape_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','runId','storyId','sequence','tool','request','requestedAt','completedAt','outcome']
    AND (
      (outcome = 'succeeded'
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
    AND jsonb_typeof(payload -> 'completedAt') = 'string'
    AND btrim(payload ->> 'completedAt') <> ''
    -- An audit record, not a copy of what the tool retrieved.
    AND length(payload -> 'request' #>> '{}') <= 4000
    AND (NOT payload ? 'result' OR length(payload -> 'result' #>> '{}') <= 4000)
  ),
  CONSTRAINT agent_tool_calls_failure_check CHECK (
    outcome <> 'failed'
    OR (
      jsonb_typeof(payload -> 'failure') = 'object'
      AND (payload -> 'failure') ?& ARRAY['code','retryable','message']
      AND (payload -> 'failure') - ARRAY['code','retryable','message'] = '{}'::jsonb
      AND payload -> 'failure' ->> 'code' IN (
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
  )
);

CREATE INDEX agent_tool_calls_run_position_index
  ON storyrail.agent_tool_calls (run_id, append_position);

COMMIT;
