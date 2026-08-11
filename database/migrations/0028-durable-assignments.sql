BEGIN;

ALTER TABLE storyrail.agent_profiles
  ADD CONSTRAINT agent_profiles_profile_id_role_key UNIQUE (profile_id, role);

CREATE FUNCTION storyrail.jsonb_text_array_has_unique_items(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT count(*) = count(DISTINCT item)
  FROM jsonb_array_elements_text(value) AS items(item)
$$;

CREATE TABLE storyrail.story_assignments (
  assignment_id text PRIMARY KEY,
  story_id text NOT NULL UNIQUE REFERENCES storyrail.stories (story_id),
  writer_profile_id text NOT NULL,
  writer_role text NOT NULL DEFAULT 'writer',
  payload jsonb NOT NULL,
  CONSTRAINT story_assignments_writer_role_check CHECK (writer_role = 'writer'),
  CONSTRAINT story_assignments_writer_profile_fk
    FOREIGN KEY (writer_profile_id, writer_role)
    REFERENCES storyrail.agent_profiles (profile_id, role),
  CONSTRAINT story_assignments_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT story_assignments_payload_exact_shape_check CHECK (
    payload ?& ARRAY[
      'id', 'storyId', 'writerProfileId', 'sourceIds', 'angle', 'brief',
      'constraints', 'assignedBy', 'assignedAt'
    ]
    AND payload - ARRAY[
      'id', 'storyId', 'writerProfileId', 'sourceIds', 'angle', 'brief',
      'constraints', 'assignedBy', 'assignedAt'
    ] = '{}'::jsonb
  ),
  CONSTRAINT story_assignments_payload_identity_check CHECK (
    jsonb_typeof(payload -> 'id') = 'string' AND payload ->> 'id' = assignment_id
    AND jsonb_typeof(payload -> 'storyId') = 'string' AND payload ->> 'storyId' = story_id
    AND jsonb_typeof(payload -> 'writerProfileId') = 'string'
    AND payload ->> 'writerProfileId' = writer_profile_id
  ),
  CONSTRAINT story_assignments_payload_source_ids_check CHECK (
    jsonb_typeof(payload -> 'sourceIds') = 'array'
    AND NOT jsonb_path_exists(payload -> 'sourceIds', '$[*] ? (@.type() != "string")')
    AND storyrail.jsonb_text_array_has_unique_items(payload -> 'sourceIds')
  ),
  CONSTRAINT story_assignments_payload_text_check CHECK (
    jsonb_typeof(payload -> 'angle') = 'string'
    AND btrim(payload ->> 'angle') <> '' AND payload ->> 'angle' = btrim(payload ->> 'angle')
    AND jsonb_typeof(payload -> 'brief') = 'string'
    AND btrim(payload ->> 'brief') <> '' AND payload ->> 'brief' = btrim(payload ->> 'brief')
    AND (
      jsonb_typeof(payload -> 'constraints') = 'null'
      OR (
        jsonb_typeof(payload -> 'constraints') = 'string'
        AND btrim(payload ->> 'constraints') <> ''
        AND payload ->> 'constraints' = btrim(payload ->> 'constraints')
      )
    )
    AND jsonb_typeof(payload -> 'assignedAt') = 'string'
  ),
  CONSTRAINT story_assignments_payload_actor_check CHECK (
    jsonb_typeof(payload -> 'assignedBy') = 'object'
    AND (
      (
        payload -> 'assignedBy' ->> 'type' = 'operator'
        AND (payload -> 'assignedBy') ?& ARRAY['type', 'operatorId']
        AND (payload -> 'assignedBy') - ARRAY['type', 'operatorId'] = '{}'::jsonb
        AND jsonb_typeof(payload -> 'assignedBy' -> 'operatorId') = 'string'
      )
      OR (
        payload -> 'assignedBy' ->> 'type' = 'agent'
        AND (payload -> 'assignedBy') ?& ARRAY['type', 'role', 'runId']
        AND (payload -> 'assignedBy') - ARRAY['type', 'role', 'runId'] = '{}'::jsonb
        AND payload -> 'assignedBy' ->> 'role' = 'assignment_editor'
        AND jsonb_typeof(payload -> 'assignedBy' -> 'runId') = 'string'
      )
    )
  )
);

CREATE TABLE storyrail.story_transition_receipts (
  transition_id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES storyrail.stories (story_id),
  previous_state text NOT NULL,
  next_state text NOT NULL,
  revision_cycle integer NOT NULL,
  payload jsonb NOT NULL,
  append_position bigint GENERATED ALWAYS AS IDENTITY,
  CONSTRAINT story_transition_receipts_state_check CHECK (
    previous_state IN ('intake','assigned','in_progress','in_review','changes_requested','approved','rejected','published')
    AND next_state IN ('intake','assigned','in_progress','in_review','changes_requested','approved','rejected','published')
  ),
  CONSTRAINT story_transition_receipts_revision_cycle_check CHECK (revision_cycle BETWEEN 0 AND 2),
  CONSTRAINT story_transition_receipts_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT story_transition_receipts_payload_exact_shape_check CHECK (
    payload ?& ARRAY[
      'transitionId', 'storyId', 'previousState', 'nextState', 'actor', 'reason',
      'occurredAt', 'revisionCycle'
    ]
    AND payload - ARRAY[
      'transitionId', 'storyId', 'previousState', 'nextState', 'actor', 'reason',
      'occurredAt', 'revisionCycle'
    ] = '{}'::jsonb
  ),
  CONSTRAINT story_transition_receipts_payload_relational_check CHECK (
    jsonb_typeof(payload -> 'transitionId') = 'string'
    AND payload ->> 'transitionId' = transition_id
    AND jsonb_typeof(payload -> 'storyId') = 'string' AND payload ->> 'storyId' = story_id
    AND jsonb_typeof(payload -> 'previousState') = 'string'
    AND payload ->> 'previousState' = previous_state
    AND jsonb_typeof(payload -> 'nextState') = 'string' AND payload ->> 'nextState' = next_state
    AND jsonb_typeof(payload -> 'revisionCycle') = 'number'
    AND (payload ->> 'revisionCycle')::integer = revision_cycle
    AND payload ->> 'revisionCycle' = revision_cycle::text
  ),
  CONSTRAINT story_transition_receipts_payload_facts_check CHECK (
    jsonb_typeof(payload -> 'reason') = 'string'
    AND btrim(payload ->> 'reason') <> '' AND payload ->> 'reason' = btrim(payload ->> 'reason')
    AND jsonb_typeof(payload -> 'occurredAt') = 'string'
    AND jsonb_typeof(payload -> 'actor') = 'object'
    AND (
      (
        payload -> 'actor' ->> 'type' = 'operator'
        AND (payload -> 'actor') ?& ARRAY['type', 'operatorId']
        AND (payload -> 'actor') - ARRAY['type', 'operatorId'] = '{}'::jsonb
        AND jsonb_typeof(payload -> 'actor' -> 'operatorId') = 'string'
      )
      OR (
        payload -> 'actor' ->> 'type' = 'agent'
        AND (payload -> 'actor') ?& ARRAY['type', 'role', 'runId']
        AND (payload -> 'actor') - ARRAY['type', 'role', 'runId'] = '{}'::jsonb
        AND payload -> 'actor' ->> 'role' IN ('assignment_editor','writer','fact_checker','editor_in_chief')
        AND jsonb_typeof(payload -> 'actor' -> 'runId') = 'string'
      )
    )
  )
);

CREATE UNIQUE INDEX story_transition_receipts_append_position_key
  ON storyrail.story_transition_receipts (append_position);
CREATE INDEX story_transition_receipts_story_append_idx
  ON storyrail.story_transition_receipts (story_id, append_position);

COMMIT;
