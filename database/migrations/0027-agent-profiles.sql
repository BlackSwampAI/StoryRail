BEGIN;

CREATE TABLE storyrail.agent_profiles (
  profile_id text PRIMARY KEY,
  role text NOT NULL,
  built_in boolean NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT agent_profiles_role_check
    CHECK (role IN ('assignment_editor', 'writer', 'editor_in_chief')),
  CONSTRAINT agent_profiles_custom_writer_check
    CHECK (built_in OR role = 'writer'),
  CONSTRAINT agent_profiles_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT agent_profiles_payload_exact_shape_check
    CHECK (
      payload ?& ARRAY['id', 'role', 'name', 'instructions', 'model', 'builtIn']
      AND payload - ARRAY['id', 'role', 'name', 'instructions', 'model', 'builtIn'] = '{}'::jsonb
    ),
  CONSTRAINT agent_profiles_payload_identity_check
    CHECK (
      jsonb_typeof(payload -> 'id') = 'string'
      AND payload ->> 'id' = profile_id
    ),
  CONSTRAINT agent_profiles_payload_role_check
    CHECK (
      jsonb_typeof(payload -> 'role') = 'string'
      AND payload ->> 'role' = role
    ),
  CONSTRAINT agent_profiles_payload_built_in_check
    CHECK (
      jsonb_typeof(payload -> 'builtIn') = 'boolean'
      AND (payload ->> 'builtIn')::boolean = built_in
    ),
  CONSTRAINT agent_profiles_payload_name_check
    CHECK (
      jsonb_typeof(payload -> 'name') = 'string'
      AND btrim(payload ->> 'name') <> ''
      AND payload ->> 'name' = btrim(payload ->> 'name')
    ),
  CONSTRAINT agent_profiles_payload_instructions_check
    CHECK (
      jsonb_typeof(payload -> 'instructions') = 'string'
      AND btrim(payload ->> 'instructions') <> ''
      AND payload ->> 'instructions' = btrim(payload ->> 'instructions')
    ),
  CONSTRAINT agent_profiles_payload_model_check
    CHECK (
      jsonb_typeof(payload -> 'model') = 'null'
      OR (
        jsonb_typeof(payload -> 'model') = 'object'
        AND (payload -> 'model') ?& ARRAY['provider', 'model']
        AND (payload -> 'model') - ARRAY['provider', 'model'] = '{}'::jsonb
        AND jsonb_typeof(payload -> 'model' -> 'provider') = 'string'
        AND btrim(payload -> 'model' ->> 'provider') <> ''
        AND payload -> 'model' ->> 'provider' = btrim(payload -> 'model' ->> 'provider')
        AND jsonb_typeof(payload -> 'model' -> 'model') = 'string'
        AND btrim(payload -> 'model' ->> 'model') <> ''
        AND payload -> 'model' ->> 'model' = btrim(payload -> 'model' ->> 'model')
      )
    )
);

INSERT INTO storyrail.agent_profiles (profile_id, role, built_in, payload)
VALUES
  (
    'storyrail-assignment-editor-v1',
    'assignment_editor',
    true,
    jsonb_build_object(
      'id', 'storyrail-assignment-editor-v1',
      'role', 'assignment_editor',
      'name', 'Assignment Editor',
      'instructions', 'Assess evidence and editorial value, choose a bounded disposition, and prepare a focused assignment without exceeding the available evidence.',
      'model', null,
      'builtIn', true
    )
  ),
  (
    'storyrail-general-writer-v1',
    'writer',
    true,
    jsonb_build_object(
      'id', 'storyrail-general-writer-v1',
      'role', 'writer',
      'name', 'General Writer',
      'instructions', 'Produce original editorial work within the assignment scope, grounded in the supplied evidence, and never invent unsupported facts.',
      'model', null,
      'builtIn', true
    )
  ),
  (
    'storyrail-director-v1',
    'editor_in_chief',
    true,
    jsonb_build_object(
      'id', 'storyrail-director-v1',
      'role', 'editor_in_chief',
      'name', 'Director',
      'instructions', 'Independently review work against its assignment and evidence, then approve or request changes within StoryRail''s bounded review policy.',
      'model', null,
      'builtIn', true
    )
  );

COMMIT;
