BEGIN;

ALTER TABLE storyrail.policy_runs
  DROP CONSTRAINT policy_runs_payload_shape_check;

-- Settled policy runs are normally immutable. Temporarily remove the guard so every historical
-- payload can acquire the same explicit first-attempt state as a newly appended run.
DROP TRIGGER policy_runs_progress_only ON storyrail.policy_runs;

UPDATE storyrail.policy_runs
SET payload = payload || jsonb_build_object('attempt', 1);

ALTER TABLE storyrail.policy_runs
  ADD CONSTRAINT policy_runs_payload_shape_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','storyId','sourceId','policy','requestedBy','research','startedAt','step','attempt','observedAt','status']
    AND (
      (status = 'running'
       AND payload - ARRAY['id','storyId','sourceId','policy','requestedBy','research','startedAt','step','attempt','observedAt','status'] = '{}'::jsonb)
      OR (status = 'settled'
       AND payload ?& ARRAY['conclusion','reason','completedAt']
       AND payload - ARRAY['id','storyId','sourceId','policy','requestedBy','research','startedAt','step','attempt','observedAt','status','conclusion','reason','completedAt'] = '{}'::jsonb
       AND payload ->> 'conclusion' IN ('completed', 'stopped', 'abandoned')
       AND jsonb_typeof(payload -> 'reason') = 'string' AND btrim(payload ->> 'reason') <> ''
       AND jsonb_typeof(payload -> 'completedAt') = 'string' AND btrim(payload ->> 'completedAt') <> '')
    )
    AND payload ->> 'id' = policy_run_id
    AND CASE WHEN story_id IS NULL THEN jsonb_typeof(payload -> 'storyId') = 'null'
             ELSE payload ->> 'storyId' = story_id END
    AND CASE WHEN source_id IS NULL THEN jsonb_typeof(payload -> 'sourceId') = 'null'
             ELSE payload ->> 'sourceId' = source_id END
    AND payload ->> 'policy' = policy
    AND payload ->> 'status' = status
    AND payload ->> 'step' = step
    AND jsonb_typeof(payload -> 'attempt') = 'number'
    AND payload -> 'attempt' IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
    AND (payload -> 'attempt' = '1'::jsonb OR step IN ('writer_draft', 'writer_revision'))
    AND jsonb_typeof(payload -> 'research') = 'boolean'
    AND payload -> 'requestedBy' = jsonb_build_object(
      'type', 'operator', 'operatorId', payload -> 'requestedBy' -> 'operatorId'
    )
    AND jsonb_typeof(payload -> 'requestedBy' -> 'operatorId') = 'string'
    AND btrim(payload -> 'requestedBy' ->> 'operatorId') <> ''
    AND jsonb_typeof(payload -> 'startedAt') = 'string'
    AND btrim(payload ->> 'startedAt') <> ''
  );

CREATE TRIGGER policy_runs_progress_only
  BEFORE UPDATE ON storyrail.policy_runs
  FOR EACH ROW EXECUTE FUNCTION storyrail.policy_run_progress_only();

COMMIT;
