BEGIN;

-- Every Story so far has rested on the single Source an operator submitted, because nothing in
-- the newsroom could go and look for more. The Researcher can: it reads the evidence already
-- gathered, follows what that evidence points at, and attaches what is worth keeping.
--
-- The run records which Sources it attached. Which evidence a Story rests on is an editorial
-- fact, and recording it where the decision was made is more honest than inferring it later
-- from whatever happens to be attached.

ALTER TABLE storyrail.agent_profiles
  DROP CONSTRAINT agent_profiles_role_check,
  ADD CONSTRAINT agent_profiles_role_check
    CHECK (role IN ('assignment_editor', 'researcher', 'writer', 'editor_in_chief'));

INSERT INTO storyrail.agent_profiles (profile_id, role, built_in, payload)
VALUES (
  'storyrail-researcher-v1',
  'researcher',
  true,
  jsonb_build_object(
    'id', 'storyrail-researcher-v1',
    'role', 'researcher',
    'name', 'Researcher',
    'instructions', 'Widen the evidence behind a Story. Follow what the supplied evidence points at, retrieve material that corroborates, dates, or complicates it, and attach only what a reporter would actually cite. Never attach a page you did not retrieve.',
    'model', null,
    'builtIn', true
  )
);

CREATE FUNCTION storyrail.researched_sources_are_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(value) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(value) AS entry(source)
      WHERE jsonb_typeof(entry.source) <> 'object'
        OR NOT entry.source ?& ARRAY['sourceId', 'url', 'relevance']
        OR entry.source - ARRAY['sourceId', 'url', 'relevance'] <> '{}'::jsonb
        OR jsonb_typeof(entry.source -> 'sourceId') <> 'string'
        OR btrim(entry.source ->> 'sourceId') = ''
        OR jsonb_typeof(entry.source -> 'url') <> 'string'
        OR btrim(entry.source ->> 'url') = ''
        OR jsonb_typeof(entry.source -> 'relevance') <> 'string'
        OR btrim(entry.source ->> 'relevance') = ''
    )
    AND (
      SELECT count(DISTINCT entry.source ->> 'sourceId') = count(*)
      FROM jsonb_array_elements(value) AS entry(source)
    )
$$;

ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_supported_operation_check,
  DROP CONSTRAINT agent_runs_payload_exact_shape_check,
  DROP CONSTRAINT agent_runs_payload_input_check;

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_supported_operation_check CHECK (
    (role = 'assignment_editor' AND operation = 'assignment_proposal')
    OR (role = 'researcher' AND operation = 'source_research')
    OR (role = 'writer' AND operation IN ('article_draft', 'article_revision'))
    OR (role = 'editor_in_chief' AND operation = 'article_review')
  ),
  ADD CONSTRAINT agent_runs_payload_exact_shape_check CHECK (
    payload ?& ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome']
    AND (
      (outcome = 'running'
       AND jsonb_typeof(payload -> 'completedAt') = 'null'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome'] = '{}'::jsonb)
      OR (role = 'assignment_editor' AND outcome = 'succeeded' AND payload ? 'proposal'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','proposal'] = '{}'::jsonb)
      OR (role = 'researcher' AND outcome = 'succeeded' AND payload ? 'attached'
       AND storyrail.researched_sources_are_valid(payload -> 'attached')
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','attached'] = '{}'::jsonb)
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
      -- Research widens the evidence before an Assignment exists, so it sees the Story and what
      -- has been gathered so far, and nothing about a Writer or an Article.
      (role = 'researcher'
       AND (payload -> 'input') ?& ARRAY['story','evidence','unavailableSourceIds']
       AND (payload -> 'input') - ARRAY['story','evidence','unavailableSourceIds'] = '{}'::jsonb)
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

-- A Source the Researcher found is attached by the Researcher. The attachment record already
-- anticipated an agent attacher; it simply predates this role.
--
-- Three other actor lists still name the roles that existed before the Researcher:
-- source_triage_decisions_payload_decided_by_check, story_transition_receipts_payload_facts_check,
-- and agent_runs_payload_actor_time_check. A Researcher reaches none of them — it triages
-- nothing, moves no Story between states, and is requested by an operator — so they are left
-- as they are rather than rewritten without a path that exercises them.

-- A successful research run carries the Sources it attached, so the outcome check has to know
-- that shape alongside every other role's result.
ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_payload_outcome_check;

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_payload_outcome_check CHECK (
    outcome = 'running'
    -- A successful research run carries the Sources it attached.
    OR (role = 'researcher' AND outcome = 'succeeded'
     AND storyrail.researched_sources_are_valid(payload -> 'attached'))
    OR (role = 'assignment_editor' AND outcome = 'succeeded'
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

ALTER TABLE storyrail.story_source_attachments
  DROP CONSTRAINT story_source_attachments_payload_attached_by_check;

ALTER TABLE storyrail.story_source_attachments
  ADD CONSTRAINT story_source_attachments_payload_attached_by_check
    CHECK (
      payload ? 'attachedBy'
      AND jsonb_typeof(payload -> 'attachedBy') = 'object'
      AND (
        (
          payload -> 'attachedBy' = jsonb_build_object(
            'type', 'operator',
            'operatorId', payload -> 'attachedBy' -> 'operatorId'
          )
          AND jsonb_typeof(payload -> 'attachedBy' -> 'operatorId') = 'string'
        )
        OR
        (
          payload -> 'attachedBy' = jsonb_build_object(
            'type', 'agent',
            'role', payload -> 'attachedBy' -> 'role',
            'runId', payload -> 'attachedBy' -> 'runId'
          )
          AND jsonb_typeof(payload -> 'attachedBy' -> 'role') = 'string'
          AND payload -> 'attachedBy' ->> 'role' IN (
            'assignment_editor',
            'researcher',
            'writer',
            'fact_checker',
            'editor_in_chief'
          )
          AND jsonb_typeof(payload -> 'attachedBy' -> 'runId') = 'string'
        )
      )
    );

COMMIT;
