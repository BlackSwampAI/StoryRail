BEGIN;

CREATE FUNCTION storyrail.writer_run_source_snapshot_is_valid(
  source_ids jsonb,
  evidence jsonb,
  unavailable_source_ids jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(source_ids) = 'array'
    AND jsonb_typeof(evidence) = 'array'
    AND jsonb_typeof(unavailable_source_ids) = 'array'
    AND jsonb_array_length(CASE WHEN jsonb_typeof(source_ids) = 'array' THEN source_ids ELSE '[]'::jsonb END)
      = jsonb_array_length(CASE WHEN jsonb_typeof(evidence) = 'array' THEN evidence ELSE '[]'::jsonb END)
        + jsonb_array_length(CASE WHEN jsonb_typeof(unavailable_source_ids) = 'array' THEN unavailable_source_ids ELSE '[]'::jsonb END)
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(source_ids) = 'array' THEN source_ids ELSE '[]'::jsonb END
      ) AS assigned(source_id)
      WHERE NOT ((
        CASE WHEN jsonb_typeof(unavailable_source_ids) = 'array'
          THEN unavailable_source_ids ELSE '[]'::jsonb END
      ) ? assigned.source_id)
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(evidence) = 'array' THEN evidence ELSE '[]'::jsonb END
          ) AS selected(item)
          WHERE selected.item ->> 'sourceId' = assigned.source_id
        )
    )
$$;

ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_supported_operation_check,
  DROP CONSTRAINT agent_runs_payload_exact_shape_check,
  DROP CONSTRAINT agent_runs_payload_input_check,
  DROP CONSTRAINT agent_runs_payload_outcome_check;

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_supported_operation_check CHECK (
    (role = 'assignment_editor' AND operation = 'assignment_proposal')
    OR (role = 'writer' AND operation = 'article_draft')
  ),
  ADD CONSTRAINT agent_runs_payload_exact_shape_check CHECK (
    payload ?& ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome']
    AND (
      (role = 'assignment_editor' AND outcome = 'succeeded' AND payload ? 'proposal'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','proposal'] = '{}'::jsonb)
      OR (role = 'writer' AND outcome = 'succeeded' AND payload ?& ARRAY['articleId','revisionId']
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','articleId','revisionId'] = '{}'::jsonb)
      OR (outcome = 'failed' AND payload ? 'failure'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','failure'] = '{}'::jsonb)
    )
  ),
  ADD CONSTRAINT agent_runs_payload_input_check CHECK (
    jsonb_typeof(payload -> 'input') = 'object'
    AND jsonb_typeof(payload -> 'input' -> 'story') = 'object'
    AND (payload -> 'input' -> 'story') ?& ARRAY['id','title','state','revisionCycle']
    AND (payload -> 'input' -> 'story') - ARRAY['id','title','state','revisionCycle'] = '{}'::jsonb
    AND payload -> 'input' -> 'story' ->> 'id' = story_id
    AND jsonb_typeof(payload -> 'input' -> 'story' -> 'title') = 'string'
    AND btrim(payload -> 'input' -> 'story' ->> 'title') <> ''
    AND payload -> 'input' -> 'story' ->> 'state' IN ('intake','assigned','in_progress','in_review','changes_requested','approved','rejected','published')
    AND jsonb_typeof(payload -> 'input' -> 'story' -> 'revisionCycle') = 'number'
    AND (payload -> 'input' -> 'story' ->> 'revisionCycle')::integer BETWEEN 0 AND 2
    AND storyrail.assignment_run_evidence_is_valid(payload -> 'input' -> 'evidence')
    AND jsonb_array_length(payload -> 'input' -> 'evidence') > 0
    AND storyrail.assignment_run_text_array_is_valid(payload -> 'input' -> 'unavailableSourceIds')
    AND storyrail.assignment_run_source_sets_are_disjoint(payload -> 'input' -> 'evidence', payload -> 'input' -> 'unavailableSourceIds')
    AND (
      (role = 'assignment_editor'
       AND (payload -> 'input') ?& ARRAY['story','evidence','unavailableSourceIds','writerProfileIds']
       AND (payload -> 'input') - ARRAY['story','evidence','unavailableSourceIds','writerProfileIds'] = '{}'::jsonb
       AND storyrail.assignment_run_text_array_is_valid(payload -> 'input' -> 'writerProfileIds')
       AND jsonb_array_length(payload -> 'input' -> 'writerProfileIds') > 0)
      OR
      (role = 'writer'
       AND (payload -> 'input') ?& ARRAY['story','assignment','evidence','unavailableSourceIds']
       AND (payload -> 'input') - ARRAY['story','assignment','evidence','unavailableSourceIds'] = '{}'::jsonb
       AND jsonb_typeof(payload -> 'input' -> 'assignment') = 'object'
       AND (payload -> 'input' -> 'assignment') ?& ARRAY['id','storyId','writerProfileId','sourceIds','angle','brief','constraints']
       AND (payload -> 'input' -> 'assignment') - ARRAY['id','storyId','writerProfileId','sourceIds','angle','brief','constraints'] = '{}'::jsonb
       AND jsonb_typeof(payload -> 'input' -> 'assignment' -> 'id') = 'string'
       AND btrim(payload -> 'input' -> 'assignment' ->> 'id') <> ''
       AND payload -> 'input' -> 'assignment' ->> 'storyId' = story_id
       AND payload -> 'input' -> 'assignment' ->> 'writerProfileId' = profile_id
       AND storyrail.assignment_run_text_array_is_valid(payload -> 'input' -> 'assignment' -> 'sourceIds')
       AND jsonb_array_length(payload -> 'input' -> 'assignment' -> 'sourceIds') > 0
       AND storyrail.writer_run_source_snapshot_is_valid(
         payload -> 'input' -> 'assignment' -> 'sourceIds',
         payload -> 'input' -> 'evidence',
         payload -> 'input' -> 'unavailableSourceIds'
       )
       AND jsonb_typeof(payload -> 'input' -> 'assignment' -> 'angle') = 'string'
       AND btrim(payload -> 'input' -> 'assignment' ->> 'angle') <> ''
       AND payload -> 'input' -> 'assignment' ->> 'angle' = btrim(payload -> 'input' -> 'assignment' ->> 'angle')
       AND jsonb_typeof(payload -> 'input' -> 'assignment' -> 'brief') = 'string'
       AND btrim(payload -> 'input' -> 'assignment' ->> 'brief') <> ''
       AND payload -> 'input' -> 'assignment' ->> 'brief' = btrim(payload -> 'input' -> 'assignment' ->> 'brief')
       AND (jsonb_typeof(payload -> 'input' -> 'assignment' -> 'constraints') = 'null'
         OR (jsonb_typeof(payload -> 'input' -> 'assignment' -> 'constraints') = 'string'
           AND btrim(payload -> 'input' -> 'assignment' ->> 'constraints') <> ''
           AND payload -> 'input' -> 'assignment' ->> 'constraints' = btrim(payload -> 'input' -> 'assignment' ->> 'constraints'))))
    )
  ),
  ADD CONSTRAINT agent_runs_payload_outcome_check CHECK (
    (role = 'assignment_editor' AND outcome = 'succeeded'
     AND jsonb_typeof(payload -> 'proposal') = 'object'
     AND (payload -> 'proposal') ?& ARRAY['writerProfileId','angle','brief','constraints','reason']
     AND (payload -> 'proposal') - ARRAY['writerProfileId','angle','brief','constraints','reason'] = '{}'::jsonb
     AND jsonb_typeof(payload -> 'proposal' -> 'writerProfileId') = 'string'
     AND (payload -> 'input' -> 'writerProfileIds') ? (payload -> 'proposal' ->> 'writerProfileId')
     AND jsonb_typeof(payload -> 'proposal' -> 'angle') = 'string' AND btrim(payload -> 'proposal' ->> 'angle') <> '' AND payload -> 'proposal' ->> 'angle' = btrim(payload -> 'proposal' ->> 'angle')
     AND jsonb_typeof(payload -> 'proposal' -> 'brief') = 'string' AND btrim(payload -> 'proposal' ->> 'brief') <> '' AND payload -> 'proposal' ->> 'brief' = btrim(payload -> 'proposal' ->> 'brief')
     AND (jsonb_typeof(payload -> 'proposal' -> 'constraints') = 'null' OR (jsonb_typeof(payload -> 'proposal' -> 'constraints') = 'string' AND btrim(payload -> 'proposal' ->> 'constraints') <> '' AND payload -> 'proposal' ->> 'constraints' = btrim(payload -> 'proposal' ->> 'constraints')))
     AND jsonb_typeof(payload -> 'proposal' -> 'reason') = 'string' AND btrim(payload -> 'proposal' ->> 'reason') <> '' AND payload -> 'proposal' ->> 'reason' = btrim(payload -> 'proposal' ->> 'reason'))
    OR (role = 'writer' AND outcome = 'succeeded'
     AND jsonb_typeof(payload -> 'articleId') = 'string' AND btrim(payload ->> 'articleId') <> ''
     AND payload ->> 'articleId' = btrim(payload ->> 'articleId')
     AND jsonb_typeof(payload -> 'revisionId') = 'string' AND btrim(payload ->> 'revisionId') <> ''
     AND payload ->> 'revisionId' = btrim(payload ->> 'revisionId'))
    OR (outcome = 'failed' AND jsonb_typeof(payload -> 'failure') = 'object'
     AND (payload -> 'failure') ?& ARRAY['code','retryable']
     AND (payload -> 'failure') - ARRAY['code','retryable'] = '{}'::jsonb
     AND payload -> 'failure' ->> 'code' IN ('MODEL_AUTHENTICATION_FAILED','MODEL_REQUEST_TIMED_OUT','MODEL_REQUEST_FAILED','MODEL_RESPONSE_REJECTED','MODEL_OUTPUT_INVALID')
     AND jsonb_typeof(payload -> 'failure' -> 'retryable') = 'boolean')
  ),
  ADD CONSTRAINT agent_runs_run_profile_role_outcome_key UNIQUE (run_id, profile_id, role, outcome);

ALTER TABLE storyrail.story_assignments
  ADD CONSTRAINT story_assignments_assignment_story_key UNIQUE (assignment_id, story_id);

CREATE TABLE storyrail.articles (
  article_id text PRIMARY KEY,
  story_id text NOT NULL UNIQUE REFERENCES storyrail.stories (story_id),
  assignment_id text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  CONSTRAINT articles_assignment_story_fk FOREIGN KEY (assignment_id, story_id)
    REFERENCES storyrail.story_assignments (assignment_id, story_id),
  CONSTRAINT articles_identity_check CHECK (btrim(article_id) <> '' AND article_id = btrim(article_id)),
  CONSTRAINT articles_payload_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','storyId','assignmentId','createdAt']
    AND payload - ARRAY['id','storyId','assignmentId','createdAt'] = '{}'::jsonb
    AND payload ->> 'id' = article_id AND payload ->> 'storyId' = story_id
    AND payload ->> 'assignmentId' = assignment_id
    AND jsonb_typeof(payload -> 'createdAt') = 'string' AND btrim(payload ->> 'createdAt') <> ''
  )
);

CREATE TABLE storyrail.article_revisions (
  revision_id text PRIMARY KEY,
  article_id text NOT NULL REFERENCES storyrail.articles (article_id),
  revision_number integer NOT NULL,
  writer_profile_id text NOT NULL,
  writer_role text NOT NULL DEFAULT 'writer',
  agent_run_id text NOT NULL,
  agent_run_outcome text NOT NULL DEFAULT 'succeeded',
  payload jsonb NOT NULL,
  append_position bigint GENERATED ALWAYS AS IDENTITY,
  CONSTRAINT article_revisions_article_number_key UNIQUE (article_id, revision_number),
  CONSTRAINT article_revisions_first_revision_check CHECK (revision_number = 1),
  CONSTRAINT article_revisions_writer_check CHECK (writer_role = 'writer' AND agent_run_outcome = 'succeeded'),
  CONSTRAINT article_revisions_writer_profile_fk FOREIGN KEY (writer_profile_id, writer_role)
    REFERENCES storyrail.agent_profiles (profile_id, role),
  CONSTRAINT article_revisions_agent_run_fk FOREIGN KEY (agent_run_id, writer_profile_id, writer_role, agent_run_outcome)
    REFERENCES storyrail.agent_runs (run_id, profile_id, role, outcome),
  CONSTRAINT article_revisions_payload_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','articleId','revisionNumber','writerProfileId','agentRunId','headline','dek','bodyMarkdown','createdBy','createdAt']
    AND payload - ARRAY['id','articleId','revisionNumber','writerProfileId','agentRunId','headline','dek','bodyMarkdown','createdBy','createdAt'] = '{}'::jsonb
    AND payload ->> 'id' = revision_id AND payload ->> 'articleId' = article_id
    AND (payload ->> 'revisionNumber')::integer = revision_number
    AND payload ->> 'writerProfileId' = writer_profile_id AND payload ->> 'agentRunId' = agent_run_id
    AND jsonb_typeof(payload -> 'headline') = 'string' AND btrim(payload ->> 'headline') <> '' AND payload ->> 'headline' = btrim(payload ->> 'headline')
    AND (jsonb_typeof(payload -> 'dek') = 'null' OR (jsonb_typeof(payload -> 'dek') = 'string' AND btrim(payload ->> 'dek') <> '' AND payload ->> 'dek' = btrim(payload ->> 'dek')))
    AND jsonb_typeof(payload -> 'bodyMarkdown') = 'string' AND btrim(payload ->> 'bodyMarkdown') <> '' AND payload ->> 'bodyMarkdown' = btrim(payload ->> 'bodyMarkdown')
    AND payload -> 'createdBy' = jsonb_build_object('type','agent','role','writer','runId',agent_run_id)
    AND jsonb_typeof(payload -> 'createdAt') = 'string' AND btrim(payload ->> 'createdAt') <> ''
  )
);

CREATE UNIQUE INDEX article_revisions_append_position_key ON storyrail.article_revisions (append_position);
CREATE INDEX article_revisions_article_append_idx ON storyrail.article_revisions (article_id, append_position);

COMMIT;
