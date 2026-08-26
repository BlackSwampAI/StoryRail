BEGIN;

-- Autopilot began at a Story that already existed with a Source already attached, so a policy run
-- could always name its Story from the moment it was written. Starting from a URL breaks that:
-- the page is preserved, extracted and prepared before anything editorial exists, and only then
-- is a Story created. Those are the slowest minutes of a run and the ones most likely to be
-- interrupted, so a record that could not be written until a Story existed would leave exactly
-- the interrupted case with nothing saying a URL was under automation at all.
--
-- The Story is therefore learned rather than declared. `story_id` starts null and is filled in
-- once, at the step that creates the Story. The progress trigger already permits this without
-- change: it refuses a Story that changes, and NULL <> 'story-x' is null rather than true, so
-- filling an empty column in is allowed and overwriting a filled one is not.
--
-- Nothing is backfilled. Every policy run written so far began at a Story and still names it.

ALTER TABLE storyrail.policy_runs
  ALTER COLUMN story_id DROP NOT NULL;

-- The payload previously required `storyId` and required it to equal the column. A run that has
-- not reached a Story yet carries an explicit null instead, so the absent case has one
-- representation rather than two — an absent key and a null one would be the same fact written
-- two ways, and the check below could not then be stated once.
ALTER TABLE storyrail.policy_runs
  DROP CONSTRAINT policy_runs_payload_shape_check;

ALTER TABLE storyrail.policy_runs
  ADD CONSTRAINT policy_runs_payload_shape_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','storyId','policy','requestedBy','research','startedAt','step','observedAt','status']
    AND (
      (status = 'running'
       AND payload - ARRAY['id','storyId','policy','requestedBy','research','startedAt','step','observedAt','status'] = '{}'::jsonb)
      OR (status = 'settled'
       AND payload ?& ARRAY['conclusion','reason','completedAt']
       AND payload - ARRAY['id','storyId','policy','requestedBy','research','startedAt','step','observedAt','status','conclusion','reason','completedAt'] = '{}'::jsonb
       AND payload ->> 'conclusion' IN ('completed', 'stopped', 'abandoned')
       AND jsonb_typeof(payload -> 'reason') = 'string'
       AND btrim(payload ->> 'reason') <> ''
       AND jsonb_typeof(payload -> 'completedAt') = 'string'
       AND btrim(payload ->> 'completedAt') <> '')
    )
    AND payload ->> 'id' = policy_run_id
    -- Written as a CASE rather than as two OR'd comparisons on purpose. `payload ->> 'storyId' =
    -- story_id` is null rather than false when the column is null, and a CHECK treats null as
    -- satisfied — so the obvious spelling would let a run with no Story claim any Story it liked
    -- in its payload while the column still said none.
    AND CASE
      WHEN story_id IS NULL THEN jsonb_typeof(payload -> 'storyId') = 'null'
      ELSE payload ->> 'storyId' = story_id
    END
    AND payload ->> 'policy' = policy
    AND payload ->> 'status' = status
    AND payload ->> 'step' = step
    AND jsonb_typeof(payload -> 'research') = 'boolean'
    AND payload -> 'requestedBy' = jsonb_build_object(
      'type', 'operator', 'operatorId', payload -> 'requestedBy' -> 'operatorId'
    )
    AND jsonb_typeof(payload -> 'requestedBy' -> 'operatorId') = 'string'
    AND btrim(payload -> 'requestedBy' ->> 'operatorId') <> ''
    AND jsonb_typeof(payload -> 'startedAt') = 'string'
    AND btrim(payload ->> 'startedAt') <> ''
  );

-- Autopilot now runs the whole sequence rather than the editorial middle of it: it takes in the
-- URL, prepares the evidence, creates the Story, attaches and triages the Source, and delivers
-- what it published. Every one of those was already a durable workflow; naming them here is what
-- lets the coordination record say which of them a run died inside.
ALTER TABLE storyrail.policy_runs
  DROP CONSTRAINT policy_runs_step_check;

ALTER TABLE storyrail.policy_runs
  ADD CONSTRAINT policy_runs_step_check CHECK (
    step IN (
      'source_intake','source_preparation','story_creation','source_attachment','source_triage',
      'source_research','assignment_proposal','assignment','writer_draft','review_submission',
      'director_review','review_decision','writer_revision','publication','delivery'
    )
  );

COMMIT;
