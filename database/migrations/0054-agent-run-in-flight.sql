BEGIN;

-- An agent run was only ever written after the model answered, so a run in flight had no
-- durable existence: nothing to show on reload, nothing to reconnect to, nothing to reconcile
-- if the process died mid-call. Runs are now recorded when they start and completed in place.
--
-- This is the one mutation permitted on an agent run, and it is one-way. A run may move from
-- 'running' to a terminal outcome exactly once; a completed run can never change again, and
-- nothing may move back to 'running'. The trigger below enforces that, so the append-only
-- guarantee that matters — finished history is immutable — still holds.

ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_outcome_check;

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_outcome_check
  CHECK (outcome IN ('running', 'succeeded', 'failed'));

-- A run in flight carries no outcome payload and no completion timestamp.
ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_payload_exact_shape_check;

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_payload_exact_shape_check CHECK (
    payload ?& ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome']
    AND (
      (outcome = 'running'
       AND jsonb_typeof(payload -> 'completedAt') = 'null'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome'] = '{}'::jsonb)
      OR (role = 'assignment_editor' AND outcome = 'succeeded' AND payload ? 'proposal'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','proposal'] = '{}'::jsonb)
      OR (role = 'writer' AND outcome = 'succeeded' AND payload ?& ARRAY['articleId','revisionId']
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','articleId','revisionId'] = '{}'::jsonb)
      OR (role = 'editor_in_chief' AND outcome = 'succeeded' AND payload ? 'review'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','review'] = '{}'::jsonb)
      OR (outcome = 'failed' AND payload ? 'failure'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','failure'] = '{}'::jsonb)
    )
  );

ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_payload_outcome_check;

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_payload_outcome_check CHECK (
    outcome = 'running'
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

-- The completion timestamp is only a string once the run has completed.
ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_payload_actor_time_check;

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_payload_actor_time_check CHECK (
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
    AND (
      (outcome = 'running' AND jsonb_typeof(payload -> 'completedAt') = 'null')
      OR (outcome <> 'running'
       AND jsonb_typeof(payload -> 'completedAt') = 'string'
       AND btrim(payload ->> 'completedAt') <> ''
       AND payload ->> 'completedAt' = btrim(payload ->> 'completedAt'))
    )
  );

-- The single permitted mutation: complete a run that is still running. Everything else about
-- an agent run stays immutable, including the identity, the input snapshot, and the outcome
-- once it is terminal.
CREATE OR REPLACE FUNCTION storyrail.agent_run_completion_is_one_way()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.outcome <> 'running' THEN
    RAISE EXCEPTION 'agent run % is already complete and cannot be modified', OLD.run_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.outcome = 'running' THEN
    RAISE EXCEPTION 'agent run % must complete to a terminal outcome', OLD.run_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.run_id <> OLD.run_id
     OR NEW.story_id <> OLD.story_id
     OR NEW.profile_id <> OLD.profile_id
     OR NEW.role <> OLD.role
     OR NEW.operation <> OLD.operation
     OR NEW.payload -> 'input' IS DISTINCT FROM OLD.payload -> 'input'
     OR NEW.payload ->> 'startedAt' IS DISTINCT FROM OLD.payload ->> 'startedAt' THEN
    RAISE EXCEPTION 'agent run % may only record its completion', OLD.run_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_runs_completion_is_one_way ON storyrail.agent_runs;

CREATE TRIGGER agent_runs_completion_is_one_way
  BEFORE UPDATE ON storyrail.agent_runs
  FOR EACH ROW
  EXECUTE FUNCTION storyrail.agent_run_completion_is_one_way();

COMMIT;
