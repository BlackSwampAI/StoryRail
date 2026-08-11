BEGIN;

CREATE FUNCTION storyrail.assignment_run_evidence_is_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(value) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END
      ) AS evidence(item)
      WHERE jsonb_typeof(item) <> 'object'
        OR NOT item ?& ARRAY['sourceId','relevance','evidenceKind','evidenceId']
        OR item - ARRAY['sourceId','relevance','evidenceKind','evidenceId'] <> '{}'::jsonb
        OR jsonb_typeof(item -> 'sourceId') <> 'string'
        OR btrim(item ->> 'sourceId') = ''
        OR item ->> 'sourceId' <> btrim(item ->> 'sourceId')
        OR jsonb_typeof(item -> 'relevance') <> 'string'
        OR btrim(item ->> 'relevance') = ''
        OR item ->> 'relevance' <> btrim(item ->> 'relevance')
        OR item ->> 'evidenceKind' NOT IN ('prepared','raw')
        OR jsonb_typeof(item -> 'evidenceId') <> 'string'
        OR btrim(item ->> 'evidenceId') = ''
        OR item ->> 'evidenceId' <> btrim(item ->> 'evidenceId')
    )
    AND (
      SELECT count(*) = count(DISTINCT item ->> 'sourceId')
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END
      ) AS evidence(item)
    )
$$;

CREATE FUNCTION storyrail.assignment_run_source_sets_are_disjoint(
  evidence jsonb,
  unavailable_source_ids jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(unavailable_source_ids) = 'array'
        THEN unavailable_source_ids ELSE '[]'::jsonb END
    ) AS unavailable(source_id)
    JOIN jsonb_array_elements(
      CASE WHEN jsonb_typeof(evidence) = 'array' THEN evidence ELSE '[]'::jsonb END
    ) AS selected(item)
      ON selected.item ->> 'sourceId' = unavailable.source_id
  )
$$;

CREATE FUNCTION storyrail.assignment_run_text_array_is_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(value) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END
      ) AS items(item)
      WHERE jsonb_typeof(item) <> 'string'
        OR btrim(item #>> '{}') = ''
        OR item #>> '{}' <> btrim(item #>> '{}')
    )
    AND (
      SELECT count(*) = count(DISTINCT item #>> '{}')
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END
      ) AS items(item)
    )
$$;

CREATE TABLE storyrail.agent_runs (
  run_id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES storyrail.stories (story_id),
  profile_id text NOT NULL,
  role text NOT NULL,
  operation text NOT NULL,
  outcome text NOT NULL,
  payload jsonb NOT NULL,
  append_position bigint GENERATED ALWAYS AS IDENTITY,
  CONSTRAINT agent_runs_profile_role_fk
    FOREIGN KEY (profile_id, role)
    REFERENCES storyrail.agent_profiles (profile_id, role),
  CONSTRAINT agent_runs_identity_check CHECK (
    btrim(run_id) <> '' AND run_id = btrim(run_id)
    AND btrim(story_id) <> '' AND story_id = btrim(story_id)
    AND btrim(profile_id) <> '' AND profile_id = btrim(profile_id)
  ),
  CONSTRAINT agent_runs_supported_operation_check
    CHECK (role = 'assignment_editor' AND operation = 'assignment_proposal'),
  CONSTRAINT agent_runs_outcome_check CHECK (outcome IN ('succeeded', 'failed')),
  CONSTRAINT agent_runs_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT agent_runs_payload_exact_shape_check CHECK (
    payload ?& ARRAY[
      'id','storyId','profileId','role','operation','model','prompt','requestedBy',
      'startedAt','completedAt','input','outcome'
    ]
    AND (
      (outcome = 'succeeded'
       AND payload ? 'proposal'
       AND NOT payload ? 'failure'
       AND payload - ARRAY[
         'id','storyId','profileId','role','operation','model','prompt','requestedBy',
         'startedAt','completedAt','input','outcome','proposal'
       ] = '{}'::jsonb)
      OR
      (outcome = 'failed'
       AND payload ? 'failure'
       AND NOT payload ? 'proposal'
       AND payload - ARRAY[
         'id','storyId','profileId','role','operation','model','prompt','requestedBy',
         'startedAt','completedAt','input','outcome','failure'
       ] = '{}'::jsonb)
    )
  ),
  CONSTRAINT agent_runs_payload_relational_check CHECK (
    jsonb_typeof(payload -> 'id') = 'string' AND payload ->> 'id' = run_id
    AND jsonb_typeof(payload -> 'storyId') = 'string' AND payload ->> 'storyId' = story_id
    AND jsonb_typeof(payload -> 'profileId') = 'string' AND payload ->> 'profileId' = profile_id
    AND payload ->> 'role' = role
    AND payload ->> 'operation' = operation
    AND payload ->> 'outcome' = outcome
  ),
  CONSTRAINT agent_runs_payload_descriptor_check CHECK (
    jsonb_typeof(payload -> 'model') = 'object'
    AND (payload -> 'model') ?& ARRAY['provider','model']
    AND (payload -> 'model') - ARRAY['provider','model'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'model' -> 'provider') = 'string'
    AND btrim(payload -> 'model' ->> 'provider') <> ''
    AND payload -> 'model' ->> 'provider' = btrim(payload -> 'model' ->> 'provider')
    AND jsonb_typeof(payload -> 'model' -> 'model') = 'string'
    AND btrim(payload -> 'model' ->> 'model') <> ''
    AND payload -> 'model' ->> 'model' = btrim(payload -> 'model' ->> 'model')
    AND jsonb_typeof(payload -> 'prompt') = 'object'
    AND (payload -> 'prompt') ?& ARRAY['key','version']
    AND (payload -> 'prompt') - ARRAY['key','version'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'prompt' -> 'key') = 'string'
    AND btrim(payload -> 'prompt' ->> 'key') <> ''
    AND payload -> 'prompt' ->> 'key' = btrim(payload -> 'prompt' ->> 'key')
    AND jsonb_typeof(payload -> 'prompt' -> 'version') = 'string'
    AND btrim(payload -> 'prompt' ->> 'version') <> ''
    AND payload -> 'prompt' ->> 'version' = btrim(payload -> 'prompt' ->> 'version')
  ),
  CONSTRAINT agent_runs_payload_actor_time_check CHECK (
    jsonb_typeof(payload -> 'requestedBy') = 'object'
    AND (
      (payload -> 'requestedBy' ->> 'type' = 'operator'
       AND (payload -> 'requestedBy') ?& ARRAY['type','operatorId']
       AND (payload -> 'requestedBy') - ARRAY['type','operatorId'] = '{}'::jsonb
       AND jsonb_typeof(payload -> 'requestedBy' -> 'operatorId') = 'string'
       AND btrim(payload -> 'requestedBy' ->> 'operatorId') <> ''
       AND payload -> 'requestedBy' ->> 'operatorId' = btrim(payload -> 'requestedBy' ->> 'operatorId'))
      OR
      (payload -> 'requestedBy' ->> 'type' = 'agent'
       AND (payload -> 'requestedBy') ?& ARRAY['type','role','runId']
       AND (payload -> 'requestedBy') - ARRAY['type','role','runId'] = '{}'::jsonb
       AND payload -> 'requestedBy' ->> 'role' IN
         ('assignment_editor','writer','fact_checker','editor_in_chief')
       AND jsonb_typeof(payload -> 'requestedBy' -> 'runId') = 'string'
       AND btrim(payload -> 'requestedBy' ->> 'runId') <> ''
       AND payload -> 'requestedBy' ->> 'runId' = btrim(payload -> 'requestedBy' ->> 'runId'))
    )
    AND jsonb_typeof(payload -> 'startedAt') = 'string'
    AND btrim(payload ->> 'startedAt') <> ''
    AND payload ->> 'startedAt' = btrim(payload ->> 'startedAt')
    AND jsonb_typeof(payload -> 'completedAt') = 'string'
    AND btrim(payload ->> 'completedAt') <> ''
    AND payload ->> 'completedAt' = btrim(payload ->> 'completedAt')
  ),
  CONSTRAINT agent_runs_payload_input_check CHECK (
    jsonb_typeof(payload -> 'input') = 'object'
    AND (payload -> 'input') ?& ARRAY['story','evidence','unavailableSourceIds','writerProfileIds']
    AND (payload -> 'input') - ARRAY['story','evidence','unavailableSourceIds','writerProfileIds'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'input' -> 'story') = 'object'
    AND (payload -> 'input' -> 'story') ?& ARRAY['id','title','state','revisionCycle']
    AND (payload -> 'input' -> 'story') - ARRAY['id','title','state','revisionCycle'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'input' -> 'story' -> 'id') = 'string'
    AND payload -> 'input' -> 'story' ->> 'id' = story_id
    AND jsonb_typeof(payload -> 'input' -> 'story' -> 'title') = 'string'
    AND btrim(payload -> 'input' -> 'story' ->> 'title') <> ''
    AND payload -> 'input' -> 'story' ->> 'title' = btrim(payload -> 'input' -> 'story' ->> 'title')
    AND jsonb_typeof(payload -> 'input' -> 'story' -> 'state') = 'string'
    AND payload -> 'input' -> 'story' ->> 'state' IN
      ('intake','assigned','in_progress','in_review','changes_requested','approved','rejected','published')
    AND jsonb_typeof(payload -> 'input' -> 'story' -> 'revisionCycle') = 'number'
    AND (payload -> 'input' -> 'story' ->> 'revisionCycle')::integer BETWEEN 0 AND 2
    AND storyrail.assignment_run_evidence_is_valid(payload -> 'input' -> 'evidence')
    AND jsonb_array_length(
      CASE WHEN jsonb_typeof(payload -> 'input' -> 'evidence') = 'array'
        THEN payload -> 'input' -> 'evidence' ELSE '[]'::jsonb END
    ) > 0
    AND storyrail.assignment_run_text_array_is_valid(payload -> 'input' -> 'unavailableSourceIds')
    AND storyrail.assignment_run_text_array_is_valid(payload -> 'input' -> 'writerProfileIds')
    AND jsonb_array_length(
      CASE WHEN jsonb_typeof(payload -> 'input' -> 'writerProfileIds') = 'array'
        THEN payload -> 'input' -> 'writerProfileIds' ELSE '[]'::jsonb END
    ) > 0
    AND storyrail.assignment_run_source_sets_are_disjoint(
      payload -> 'input' -> 'evidence',
      payload -> 'input' -> 'unavailableSourceIds'
    )
  ),
  CONSTRAINT agent_runs_payload_outcome_check CHECK (
    (
      outcome = 'succeeded'
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
      AND payload -> 'proposal' ->> 'reason' = btrim(payload -> 'proposal' ->> 'reason')
    )
    OR
    (
      outcome = 'failed'
      AND jsonb_typeof(payload -> 'failure') = 'object'
      AND (payload -> 'failure') ?& ARRAY['code','retryable']
      AND (payload -> 'failure') - ARRAY['code','retryable'] = '{}'::jsonb
      AND payload -> 'failure' ->> 'code' IN (
        'MODEL_AUTHENTICATION_FAILED','MODEL_REQUEST_TIMED_OUT','MODEL_REQUEST_FAILED',
        'MODEL_RESPONSE_REJECTED','MODEL_OUTPUT_INVALID'
      )
      AND jsonb_typeof(payload -> 'failure' -> 'retryable') = 'boolean'
    )
  )
);

CREATE UNIQUE INDEX agent_runs_append_position_key ON storyrail.agent_runs (append_position);
CREATE INDEX agent_runs_story_append_idx ON storyrail.agent_runs (story_id, append_position);

COMMIT;
