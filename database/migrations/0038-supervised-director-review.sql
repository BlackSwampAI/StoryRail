BEGIN;

CREATE FUNCTION storyrail.director_review_is_valid(value jsonb)
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
    AND (value -> 'checks') ?& ARRAY['assignment','accuracy','headline','structure','style']
    AND (value -> 'checks') - ARRAY['assignment','accuracy','headline','structure','style'] = '{}'::jsonb
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(value -> 'checks') AS checks(name, item)
      WHERE jsonb_typeof(item) <> 'object'
        OR NOT item ?& ARRAY['status','note']
        OR item - ARRAY['status','note'] <> '{}'::jsonb
        OR item ->> 'status' NOT IN ('pass','needs_changes')
        OR jsonb_typeof(item -> 'note') <> 'string'
        OR btrim(item ->> 'note') = ''
        OR item ->> 'note' <> btrim(item ->> 'note')
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

ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_supported_operation_check,
  DROP CONSTRAINT agent_runs_payload_exact_shape_check,
  DROP CONSTRAINT agent_runs_payload_input_check,
  DROP CONSTRAINT agent_runs_payload_outcome_check;

ALTER TABLE storyrail.agent_runs
  ADD COLUMN review_article_id text GENERATED ALWAYS AS (
    CASE WHEN role = 'editor_in_chief' AND operation = 'article_review'
      THEN payload #>> '{input,article,id}' ELSE NULL END
  ) STORED,
  ADD COLUMN review_revision_id text GENERATED ALWAYS AS (
    CASE WHEN role = 'editor_in_chief' AND operation = 'article_review'
      THEN payload #>> '{input,revision,id}' ELSE NULL END
  ) STORED,
  ADD CONSTRAINT agent_runs_supported_operation_check CHECK (
    (role = 'assignment_editor' AND operation = 'assignment_proposal')
    OR (role = 'writer' AND operation = 'article_draft')
    OR (role = 'editor_in_chief' AND operation = 'article_review')
  ),
  ADD CONSTRAINT agent_runs_payload_exact_shape_check CHECK (
    payload ?& ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome']
    AND (
      (role = 'assignment_editor' AND outcome = 'succeeded' AND payload ? 'proposal'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','proposal'] = '{}'::jsonb)
      OR (role = 'writer' AND outcome = 'succeeded' AND payload ?& ARRAY['articleId','revisionId']
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','articleId','revisionId'] = '{}'::jsonb)
      OR (role = 'editor_in_chief' AND outcome = 'succeeded' AND payload ? 'review'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','review'] = '{}'::jsonb)
      OR (outcome = 'failed' AND payload ? 'failure'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','failure'] = '{}'::jsonb)
    )
  ),
  ADD CONSTRAINT agent_runs_payload_input_check CHECK (
    jsonb_typeof(payload -> 'input') = 'object'
    AND jsonb_typeof(payload -> 'input' -> 'story') = 'object'
    AND (payload -> 'input' -> 'story') ?& ARRAY['id','title','state','revisionCycle']
    AND (payload -> 'input' -> 'story') - ARRAY['id','title','state','revisionCycle'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'input' -> 'story' -> 'id') = 'string'
    AND payload -> 'input' -> 'story' ->> 'id' = story_id
    AND jsonb_typeof(payload -> 'input' -> 'story' -> 'title') = 'string'
    AND btrim(payload -> 'input' -> 'story' ->> 'title') <> ''
    AND payload -> 'input' -> 'story' ->> 'title' = btrim(payload -> 'input' -> 'story' ->> 'title')
    AND jsonb_typeof(payload -> 'input' -> 'story' -> 'state') = 'string'
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
       AND jsonb_typeof(payload -> 'input' -> 'assignment' -> 'storyId') = 'string'
       AND payload -> 'input' -> 'assignment' ->> 'storyId' = story_id
       AND jsonb_typeof(payload -> 'input' -> 'assignment' -> 'writerProfileId') = 'string'
       AND payload -> 'input' -> 'assignment' ->> 'writerProfileId' = profile_id
       AND storyrail.assignment_run_text_array_is_valid(payload -> 'input' -> 'assignment' -> 'sourceIds')
       AND jsonb_array_length(payload -> 'input' -> 'assignment' -> 'sourceIds') > 0
       AND storyrail.writer_run_source_snapshot_is_valid(payload -> 'input' -> 'assignment' -> 'sourceIds', payload -> 'input' -> 'evidence', payload -> 'input' -> 'unavailableSourceIds')
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
      OR
      (role = 'editor_in_chief'
       AND payload -> 'input' -> 'story' ->> 'state' = 'in_review'
       AND (payload -> 'input') ?& ARRAY['story','assignment','article','revision','evidence','unavailableSourceIds']
       AND (payload -> 'input') - ARRAY['story','assignment','article','revision','evidence','unavailableSourceIds'] = '{}'::jsonb
       AND jsonb_typeof(payload -> 'input' -> 'assignment') = 'object'
       AND (payload -> 'input' -> 'assignment') ?& ARRAY['id','storyId','writerProfileId','sourceIds','angle','brief','constraints']
       AND (payload -> 'input' -> 'assignment') - ARRAY['id','storyId','writerProfileId','sourceIds','angle','brief','constraints'] = '{}'::jsonb
       AND jsonb_typeof(payload -> 'input' -> 'assignment' -> 'id') = 'string'
       AND btrim(payload -> 'input' -> 'assignment' ->> 'id') <> ''
       AND jsonb_typeof(payload -> 'input' -> 'assignment' -> 'storyId') = 'string'
       AND payload -> 'input' -> 'assignment' ->> 'storyId' = story_id
       AND jsonb_typeof(payload -> 'input' -> 'assignment' -> 'writerProfileId') = 'string'
       AND btrim(payload -> 'input' -> 'assignment' ->> 'writerProfileId') <> ''
       AND storyrail.assignment_run_text_array_is_valid(payload -> 'input' -> 'assignment' -> 'sourceIds')
       AND jsonb_array_length(payload -> 'input' -> 'assignment' -> 'sourceIds') > 0
       AND storyrail.writer_run_source_snapshot_is_valid(payload -> 'input' -> 'assignment' -> 'sourceIds', payload -> 'input' -> 'evidence', payload -> 'input' -> 'unavailableSourceIds')
       AND jsonb_typeof(payload -> 'input' -> 'assignment' -> 'angle') = 'string'
       AND btrim(payload -> 'input' -> 'assignment' ->> 'angle') <> ''
       AND payload -> 'input' -> 'assignment' ->> 'angle' = btrim(payload -> 'input' -> 'assignment' ->> 'angle')
       AND jsonb_typeof(payload -> 'input' -> 'assignment' -> 'brief') = 'string'
       AND btrim(payload -> 'input' -> 'assignment' ->> 'brief') <> ''
       AND payload -> 'input' -> 'assignment' ->> 'brief' = btrim(payload -> 'input' -> 'assignment' ->> 'brief')
       AND (jsonb_typeof(payload -> 'input' -> 'assignment' -> 'constraints') = 'null'
         OR (jsonb_typeof(payload -> 'input' -> 'assignment' -> 'constraints') = 'string'
           AND btrim(payload -> 'input' -> 'assignment' ->> 'constraints') <> ''
           AND payload -> 'input' -> 'assignment' ->> 'constraints' = btrim(payload -> 'input' -> 'assignment' ->> 'constraints')))
       AND jsonb_typeof(payload -> 'input' -> 'article') = 'object'
       AND (payload -> 'input' -> 'article') ?& ARRAY['id','assignmentId']
       AND (payload -> 'input' -> 'article') - ARRAY['id','assignmentId'] = '{}'::jsonb
       AND jsonb_typeof(payload -> 'input' -> 'article' -> 'id') = 'string'
       AND btrim(payload -> 'input' -> 'article' ->> 'id') <> ''
       AND jsonb_typeof(payload -> 'input' -> 'article' -> 'assignmentId') = 'string'
       AND payload -> 'input' -> 'article' ->> 'assignmentId' = payload -> 'input' -> 'assignment' ->> 'id'
       AND jsonb_typeof(payload -> 'input' -> 'revision') = 'object'
       AND (payload -> 'input' -> 'revision') ?& ARRAY['id','articleId','revisionNumber','writerProfileId','agentRunId','headline','dek','bodyMarkdown']
       AND (payload -> 'input' -> 'revision') - ARRAY['id','articleId','revisionNumber','writerProfileId','agentRunId','headline','dek','bodyMarkdown'] = '{}'::jsonb
       AND jsonb_typeof(payload -> 'input' -> 'revision' -> 'id') = 'string'
       AND btrim(payload -> 'input' -> 'revision' ->> 'id') <> ''
       AND jsonb_typeof(payload -> 'input' -> 'revision' -> 'articleId') = 'string'
       AND payload -> 'input' -> 'revision' ->> 'articleId' = payload -> 'input' -> 'article' ->> 'id'
       AND jsonb_typeof(payload -> 'input' -> 'revision' -> 'revisionNumber') = 'number'
       AND (payload -> 'input' -> 'revision' ->> 'revisionNumber')::integer = 1
       AND jsonb_typeof(payload -> 'input' -> 'revision' -> 'writerProfileId') = 'string'
       AND btrim(payload -> 'input' -> 'revision' ->> 'writerProfileId') <> ''
       AND payload -> 'input' -> 'revision' ->> 'writerProfileId' = payload -> 'input' -> 'assignment' ->> 'writerProfileId'
       AND jsonb_typeof(payload -> 'input' -> 'revision' -> 'agentRunId') = 'string'
       AND btrim(payload -> 'input' -> 'revision' ->> 'agentRunId') <> ''
       AND jsonb_typeof(payload -> 'input' -> 'revision' -> 'headline') = 'string'
       AND btrim(payload -> 'input' -> 'revision' ->> 'headline') <> ''
       AND (jsonb_typeof(payload -> 'input' -> 'revision' -> 'dek') = 'null'
         OR (jsonb_typeof(payload -> 'input' -> 'revision' -> 'dek') = 'string'
           AND btrim(payload -> 'input' -> 'revision' ->> 'dek') <> ''))
       AND jsonb_typeof(payload -> 'input' -> 'revision' -> 'bodyMarkdown') = 'string'
       AND btrim(payload -> 'input' -> 'revision' ->> 'bodyMarkdown') <> '')
    )
  ),
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
     AND jsonb_typeof(payload -> 'failure') = 'object'
     AND (payload -> 'failure') ?& ARRAY['code','retryable']
     AND (payload -> 'failure') - ARRAY['code','retryable'] = '{}'::jsonb
     AND payload -> 'failure' ->> 'code' IN ('MODEL_AUTHENTICATION_FAILED','MODEL_REQUEST_TIMED_OUT','MODEL_REQUEST_FAILED','MODEL_RESPONSE_REJECTED','MODEL_OUTPUT_INVALID')
     AND jsonb_typeof(payload -> 'failure' -> 'retryable') = 'boolean')
  );

ALTER TABLE storyrail.article_revisions
  ADD CONSTRAINT article_revisions_revision_article_key UNIQUE (revision_id, article_id);

ALTER TABLE storyrail.articles
  ADD CONSTRAINT articles_article_story_key UNIQUE (article_id, story_id);

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_review_revision_fk
    FOREIGN KEY (review_revision_id, review_article_id)
    REFERENCES storyrail.article_revisions (revision_id, article_id),
  ADD CONSTRAINT agent_runs_review_identity_key UNIQUE
    (run_id, story_id, role, operation, outcome, review_article_id, review_revision_id);

CREATE UNIQUE INDEX agent_runs_successful_director_revision_key
  ON storyrail.agent_runs (review_revision_id)
  WHERE role = 'editor_in_chief' AND operation = 'article_review' AND outcome = 'succeeded';

CREATE TABLE storyrail.review_decisions (
  decision_id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES storyrail.stories (story_id),
  article_id text NOT NULL,
  revision_id text NOT NULL UNIQUE,
  director_run_id text NOT NULL UNIQUE,
  director_role text NOT NULL DEFAULT 'editor_in_chief',
  director_operation text NOT NULL DEFAULT 'article_review',
  director_outcome text NOT NULL DEFAULT 'succeeded',
  decision text NOT NULL,
  payload jsonb NOT NULL,
  append_position bigint GENERATED ALWAYS AS IDENTITY,
  CONSTRAINT review_decisions_value_check CHECK (decision IN ('approve','request_changes')),
  CONSTRAINT review_decisions_identity_check CHECK (
    btrim(decision_id) <> '' AND decision_id = btrim(decision_id)
    AND btrim(story_id) <> '' AND story_id = btrim(story_id)
    AND btrim(article_id) <> '' AND article_id = btrim(article_id)
    AND btrim(revision_id) <> '' AND revision_id = btrim(revision_id)
    AND btrim(director_run_id) <> '' AND director_run_id = btrim(director_run_id)
  ),
  CONSTRAINT review_decisions_director_check CHECK (
    director_role = 'editor_in_chief'
    AND director_operation = 'article_review'
    AND director_outcome = 'succeeded'
  ),
  CONSTRAINT review_decisions_article_fk FOREIGN KEY (article_id, story_id)
    REFERENCES storyrail.articles (article_id, story_id),
  CONSTRAINT review_decisions_revision_fk FOREIGN KEY (revision_id, article_id)
    REFERENCES storyrail.article_revisions (revision_id, article_id),
  CONSTRAINT review_decisions_director_run_fk FOREIGN KEY
    (director_run_id, story_id, director_role, director_operation, director_outcome, article_id, revision_id)
    REFERENCES storyrail.agent_runs
    (run_id, story_id, role, operation, outcome, review_article_id, review_revision_id),
  CONSTRAINT review_decisions_payload_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','storyId','articleId','revisionId','directorRunId','decision','reason','decidedBy','decidedAt']
    AND payload - ARRAY['id','storyId','articleId','revisionId','directorRunId','decision','reason','decidedBy','decidedAt'] = '{}'::jsonb
    AND payload ->> 'id' = decision_id
    AND payload ->> 'storyId' = story_id
    AND payload ->> 'articleId' = article_id
    AND payload ->> 'revisionId' = revision_id
    AND payload ->> 'directorRunId' = director_run_id
    AND payload ->> 'decision' = decision
    AND jsonb_typeof(payload -> 'reason') = 'string'
    AND btrim(payload ->> 'reason') <> ''
    AND payload ->> 'reason' = btrim(payload ->> 'reason')
    AND payload -> 'decidedBy' ?& ARRAY['type','operatorId']
    AND (payload -> 'decidedBy') - ARRAY['type','operatorId'] = '{}'::jsonb
    AND payload -> 'decidedBy' ->> 'type' = 'operator'
    AND btrim(payload -> 'decidedBy' ->> 'operatorId') <> ''
    AND payload -> 'decidedBy' ->> 'operatorId' = btrim(payload -> 'decidedBy' ->> 'operatorId')
    AND jsonb_typeof(payload -> 'decidedAt') = 'string'
    AND btrim(payload ->> 'decidedAt') <> ''
    AND payload ->> 'decidedAt' = btrim(payload ->> 'decidedAt')
  )
);

CREATE UNIQUE INDEX review_decisions_append_position_key
  ON storyrail.review_decisions (append_position);
CREATE INDEX review_decisions_story_append_idx
  ON storyrail.review_decisions (story_id, append_position);

COMMIT;
