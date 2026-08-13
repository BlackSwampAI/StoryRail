BEGIN;

CREATE FUNCTION storyrail.agent_run_story_snapshot_is_valid(value jsonb, expected_story_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['id','title','state','revisionCycle']
    AND value - ARRAY['id','title','state','revisionCycle'] = '{}'::jsonb
    AND jsonb_typeof(value -> 'id') = 'string'
    AND value ->> 'id' = expected_story_id
    AND jsonb_typeof(value -> 'title') = 'string'
    AND btrim(value ->> 'title') <> ''
    AND value ->> 'title' = btrim(value ->> 'title')
    AND jsonb_typeof(value -> 'state') = 'string'
    AND value ->> 'state' IN ('intake','assigned','in_progress','in_review','changes_requested','approved','rejected','published')
    AND jsonb_typeof(value -> 'revisionCycle') = 'number'
    AND (value ->> 'revisionCycle')::integer BETWEEN 0 AND 2
$$;

CREATE FUNCTION storyrail.writer_assignment_snapshot_is_valid(
  value jsonb,
  expected_story_id text,
  expected_writer_profile_id text,
  evidence jsonb,
  unavailable_source_ids jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['id','storyId','writerProfileId','sourceIds','angle','brief','constraints']
    AND value - ARRAY['id','storyId','writerProfileId','sourceIds','angle','brief','constraints'] = '{}'::jsonb
    AND jsonb_typeof(value -> 'id') = 'string' AND btrim(value ->> 'id') <> ''
    AND value ->> 'id' = btrim(value ->> 'id')
    AND jsonb_typeof(value -> 'storyId') = 'string' AND value ->> 'storyId' = expected_story_id
    AND jsonb_typeof(value -> 'writerProfileId') = 'string'
    AND btrim(value ->> 'writerProfileId') <> ''
    AND value ->> 'writerProfileId' = btrim(value ->> 'writerProfileId')
    AND (expected_writer_profile_id IS NULL OR value ->> 'writerProfileId' = expected_writer_profile_id)
    AND storyrail.assignment_run_text_array_is_valid(value -> 'sourceIds')
    AND jsonb_array_length(value -> 'sourceIds') > 0
    AND storyrail.writer_run_source_snapshot_is_valid(value -> 'sourceIds', evidence, unavailable_source_ids)
    AND jsonb_typeof(value -> 'angle') = 'string' AND btrim(value ->> 'angle') <> ''
    AND value ->> 'angle' = btrim(value ->> 'angle')
    AND jsonb_typeof(value -> 'brief') = 'string' AND btrim(value ->> 'brief') <> ''
    AND value ->> 'brief' = btrim(value ->> 'brief')
    AND (jsonb_typeof(value -> 'constraints') = 'null'
      OR (jsonb_typeof(value -> 'constraints') = 'string'
        AND btrim(value ->> 'constraints') <> ''
        AND value ->> 'constraints' = btrim(value ->> 'constraints')))
$$;

CREATE FUNCTION storyrail.article_snapshot_is_valid(value jsonb, expected_assignment_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['id','assignmentId']
    AND value - ARRAY['id','assignmentId'] = '{}'::jsonb
    AND jsonb_typeof(value -> 'id') = 'string' AND btrim(value ->> 'id') <> ''
    AND value ->> 'id' = btrim(value ->> 'id')
    AND jsonb_typeof(value -> 'assignmentId') = 'string'
    AND value ->> 'assignmentId' = expected_assignment_id
$$;

CREATE FUNCTION storyrail.article_revision_snapshot_is_valid(
  value jsonb,
  expected_article_id text,
  expected_writer_profile_id text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['id','articleId','revisionNumber','writerProfileId','agentRunId','headline','dek','bodyMarkdown']
    AND value - ARRAY['id','articleId','revisionNumber','writerProfileId','agentRunId','headline','dek','bodyMarkdown'] = '{}'::jsonb
    AND jsonb_typeof(value -> 'id') = 'string' AND btrim(value ->> 'id') <> ''
    AND value ->> 'id' = btrim(value ->> 'id')
    AND jsonb_typeof(value -> 'articleId') = 'string'
    AND value ->> 'articleId' = expected_article_id
    AND jsonb_typeof(value -> 'revisionNumber') = 'number'
    AND (value ->> 'revisionNumber')::integer BETWEEN 1 AND 3
    AND jsonb_typeof(value -> 'writerProfileId') = 'string'
    AND value ->> 'writerProfileId' = expected_writer_profile_id
    AND jsonb_typeof(value -> 'agentRunId') = 'string' AND btrim(value ->> 'agentRunId') <> ''
    AND jsonb_typeof(value -> 'headline') = 'string' AND btrim(value ->> 'headline') <> ''
    AND (jsonb_typeof(value -> 'dek') = 'null'
      OR (jsonb_typeof(value -> 'dek') = 'string' AND btrim(value ->> 'dek') <> ''))
    AND jsonb_typeof(value -> 'bodyMarkdown') = 'string' AND btrim(value ->> 'bodyMarkdown') <> ''
$$;

CREATE FUNCTION storyrail.writer_revision_decision_snapshot_is_valid(
  value jsonb,
  expected_story_id text,
  expected_article_id text,
  expected_revision_id text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['id','storyId','articleId','revisionId','directorRunId','decision','reason','decidedBy','decidedAt']
    AND value - ARRAY['id','storyId','articleId','revisionId','directorRunId','decision','reason','decidedBy','decidedAt'] = '{}'::jsonb
    AND jsonb_typeof(value -> 'id') = 'string' AND btrim(value ->> 'id') <> ''
    AND jsonb_typeof(value -> 'storyId') = 'string' AND value ->> 'storyId' = expected_story_id
    AND jsonb_typeof(value -> 'articleId') = 'string' AND value ->> 'articleId' = expected_article_id
    AND jsonb_typeof(value -> 'revisionId') = 'string' AND value ->> 'revisionId' = expected_revision_id
    AND jsonb_typeof(value -> 'directorRunId') = 'string' AND btrim(value ->> 'directorRunId') <> ''
    AND value ->> 'decision' = 'request_changes'
    AND jsonb_typeof(value -> 'reason') = 'string' AND btrim(value ->> 'reason') <> ''
    AND value ->> 'reason' = btrim(value ->> 'reason')
    AND jsonb_typeof(value -> 'decidedBy') = 'object'
    AND (value -> 'decidedBy') ?& ARRAY['type','operatorId']
    AND (value -> 'decidedBy') - ARRAY['type','operatorId'] = '{}'::jsonb
    AND value #>> '{decidedBy,type}' = 'operator'
    AND btrim(value #>> '{decidedBy,operatorId}') <> ''
    AND jsonb_typeof(value -> 'decidedAt') = 'string' AND btrim(value ->> 'decidedAt') <> ''
$$;

ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_supported_operation_check,
  DROP CONSTRAINT agent_runs_payload_input_check;

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_supported_operation_check CHECK (
    (role = 'assignment_editor' AND operation = 'assignment_proposal')
    OR (role = 'writer' AND operation IN ('article_draft','article_revision'))
    OR (role = 'editor_in_chief' AND operation = 'article_review')
  ),
  ADD CONSTRAINT agent_runs_payload_input_check CHECK (
    jsonb_typeof(payload -> 'input') = 'object'
    AND storyrail.agent_run_story_snapshot_is_valid(payload -> 'input' -> 'story', story_id)
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
      (role = 'writer' AND operation = 'article_draft'
       AND payload #>> '{input,story,state}' = 'assigned'
       AND (payload -> 'input') ?& ARRAY['story','assignment','evidence','unavailableSourceIds']
       AND (payload -> 'input') - ARRAY['story','assignment','evidence','unavailableSourceIds'] = '{}'::jsonb
       AND storyrail.writer_assignment_snapshot_is_valid(
         payload -> 'input' -> 'assignment', story_id, profile_id,
         payload -> 'input' -> 'evidence', payload -> 'input' -> 'unavailableSourceIds'))
      OR
      (role = 'writer' AND operation = 'article_revision'
       AND payload #>> '{input,story,state}' = 'changes_requested'
       AND (payload #>> '{input,story,revisionCycle}')::integer BETWEEN 1 AND 2
       AND (payload -> 'input') ?& ARRAY['story','assignment','article','revision','directorReview','reviewDecision','evidence','unavailableSourceIds']
       AND (payload -> 'input') - ARRAY['story','assignment','article','revision','directorReview','reviewDecision','evidence','unavailableSourceIds'] = '{}'::jsonb
       AND storyrail.writer_assignment_snapshot_is_valid(
         payload -> 'input' -> 'assignment', story_id, profile_id,
         payload -> 'input' -> 'evidence', payload -> 'input' -> 'unavailableSourceIds')
       AND storyrail.article_snapshot_is_valid(
         payload -> 'input' -> 'article', payload #>> '{input,assignment,id}')
       AND storyrail.article_revision_snapshot_is_valid(
         payload -> 'input' -> 'revision', payload #>> '{input,article,id}',
         payload #>> '{input,assignment,writerProfileId}')
       AND (payload #>> '{input,revision,revisionNumber}')::integer =
         (payload #>> '{input,story,revisionCycle}')::integer
       AND storyrail.director_review_is_valid(payload -> 'input' -> 'directorReview')
       AND storyrail.writer_revision_decision_snapshot_is_valid(
         payload -> 'input' -> 'reviewDecision', story_id,
         payload #>> '{input,article,id}', payload #>> '{input,revision,id}'))
      OR
      (role = 'editor_in_chief' AND operation = 'article_review'
       AND payload #>> '{input,story,state}' = 'in_review'
       AND (payload -> 'input') ?& ARRAY['story','assignment','article','revision','evidence','unavailableSourceIds']
       AND (payload -> 'input') - ARRAY['story','assignment','article','revision','evidence','unavailableSourceIds'] = '{}'::jsonb
       AND storyrail.writer_assignment_snapshot_is_valid(
         payload -> 'input' -> 'assignment', story_id, NULL,
         payload -> 'input' -> 'evidence', payload -> 'input' -> 'unavailableSourceIds')
       AND storyrail.article_snapshot_is_valid(
         payload -> 'input' -> 'article', payload #>> '{input,assignment,id}')
       AND storyrail.article_revision_snapshot_is_valid(
         payload -> 'input' -> 'revision', payload #>> '{input,article,id}',
         payload #>> '{input,assignment,writerProfileId}'))
    )
  );

ALTER TABLE storyrail.article_revisions
  DROP CONSTRAINT article_revisions_first_revision_check,
  ADD CONSTRAINT article_revisions_revision_number_check CHECK (revision_number BETWEEN 1 AND 3);

ALTER TABLE storyrail.review_decisions
  ADD CONSTRAINT review_decisions_writer_revision_reference_key UNIQUE
    (decision_id, story_id, article_id, revision_id, director_run_id, decision);

ALTER TABLE storyrail.agent_runs
  ADD COLUMN writer_revision_article_id text GENERATED ALWAYS AS (
    CASE WHEN role = 'writer' AND operation = 'article_revision'
      THEN payload #>> '{input,article,id}' ELSE NULL END
  ) STORED,
  ADD COLUMN writer_revision_previous_id text GENERATED ALWAYS AS (
    CASE WHEN role = 'writer' AND operation = 'article_revision'
      THEN payload #>> '{input,revision,id}' ELSE NULL END
  ) STORED,
  ADD COLUMN writer_revision_decision_id text GENERATED ALWAYS AS (
    CASE WHEN role = 'writer' AND operation = 'article_revision'
      THEN payload #>> '{input,reviewDecision,id}' ELSE NULL END
  ) STORED,
  ADD COLUMN writer_revision_director_run_id text GENERATED ALWAYS AS (
    CASE WHEN role = 'writer' AND operation = 'article_revision'
      THEN payload #>> '{input,reviewDecision,directorRunId}' ELSE NULL END
  ) STORED,
  ADD COLUMN writer_revision_decision_value text GENERATED ALWAYS AS (
    CASE WHEN role = 'writer' AND operation = 'article_revision'
      THEN payload #>> '{input,reviewDecision,decision}' ELSE NULL END
  ) STORED,
  ADD CONSTRAINT agent_runs_writer_revision_decision_fk FOREIGN KEY (
    writer_revision_decision_id,
    story_id,
    writer_revision_article_id,
    writer_revision_previous_id,
    writer_revision_director_run_id,
    writer_revision_decision_value
  ) REFERENCES storyrail.review_decisions (
    decision_id,
    story_id,
    article_id,
    revision_id,
    director_run_id,
    decision
  );

COMMIT;
