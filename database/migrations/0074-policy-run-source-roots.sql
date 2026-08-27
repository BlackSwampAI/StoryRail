BEGIN;

-- A URL policy is tenant-scoped through the Source it has already preserved. It swaps that
-- authoritative root to the Story exactly once, immediately after Story creation.
ALTER TABLE storyrail.policy_runs
  ADD COLUMN source_id text REFERENCES storyrail.url_sources (source_id);

ALTER TABLE storyrail.policy_runs
  DROP CONSTRAINT policy_runs_payload_shape_check;

-- Historical settled rows are immutable under the old trigger. The migration must widen their
-- payloads too, so remove the trigger transactionally and restore the stricter replacement below.
DROP TRIGGER policy_runs_progress_only ON storyrail.policy_runs;

-- Older settled rows were Story-rooted. Explicit null keeps the payload and columns in one shape.
UPDATE storyrail.policy_runs
SET payload = payload || jsonb_build_object('sourceId', NULL);

-- A legacy running row without a Story cannot be assigned safely to a Site. Close it explicitly
-- rather than leaving tenant-unscoped work for reconciliation to discover.
UPDATE storyrail.policy_runs
SET status = 'settled',
    payload = payload || jsonb_build_object(
      'status', 'settled',
      'conclusion', 'abandoned',
      'reason', 'This legacy policy had no tenant-scoped root and was closed during migration.',
      'completedAt', observed_at::text
    )
WHERE status = 'running' AND story_id IS NULL;

ALTER TABLE storyrail.policy_runs
  ADD CONSTRAINT policy_runs_running_root_check CHECK (
    NOT (story_id IS NOT NULL AND source_id IS NOT NULL)
    AND (status <> 'running' OR story_id IS NOT NULL OR source_id IS NOT NULL)
  ),
  ADD CONSTRAINT policy_runs_payload_shape_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','storyId','sourceId','policy','requestedBy','research','startedAt','step','observedAt','status']
    AND (
      (status = 'running'
       AND payload - ARRAY['id','storyId','sourceId','policy','requestedBy','research','startedAt','step','observedAt','status'] = '{}'::jsonb)
      OR (status = 'settled'
       AND payload ?& ARRAY['conclusion','reason','completedAt']
       AND payload - ARRAY['id','storyId','sourceId','policy','requestedBy','research','startedAt','step','observedAt','status','conclusion','reason','completedAt'] = '{}'::jsonb
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
    AND jsonb_typeof(payload -> 'research') = 'boolean'
    AND payload -> 'requestedBy' = jsonb_build_object(
      'type', 'operator', 'operatorId', payload -> 'requestedBy' -> 'operatorId'
    )
    AND jsonb_typeof(payload -> 'requestedBy' -> 'operatorId') = 'string'
    AND btrim(payload -> 'requestedBy' ->> 'operatorId') <> ''
    AND jsonb_typeof(payload -> 'startedAt') = 'string'
    AND btrim(payload ->> 'startedAt') <> ''
  );

CREATE UNIQUE INDEX policy_runs_one_in_flight_per_source
  ON storyrail.policy_runs (source_id)
  WHERE status = 'running';

CREATE OR REPLACE FUNCTION storyrail.policy_run_progress_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_site_id text;
  story_site_id text;
BEGIN
  IF OLD.status = 'settled' THEN
    RAISE EXCEPTION 'policy run % is already settled', OLD.policy_run_id
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.policy_run_id <> OLD.policy_run_id
    OR NEW.policy <> OLD.policy
    OR NEW.payload ->> 'startedAt' <> OLD.payload ->> 'startedAt'
    OR NEW.payload -> 'requestedBy' <> OLD.payload -> 'requestedBy'
    OR NOT (
      (NEW.story_id IS NOT DISTINCT FROM OLD.story_id
       AND NEW.source_id IS NOT DISTINCT FROM OLD.source_id)
      OR (OLD.story_id IS NULL AND OLD.source_id IS NOT NULL
          AND NEW.story_id IS NOT NULL AND NEW.source_id IS NULL)
    )
  THEN
    RAISE EXCEPTION 'policy run % cannot change its identity', OLD.policy_run_id
      USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.story_id IS NULL AND OLD.source_id IS NOT NULL
    AND NEW.story_id IS NOT NULL AND NEW.source_id IS NULL
  THEN
    SELECT site_id INTO source_site_id
    FROM storyrail.url_sources WHERE source_id = OLD.source_id;
    SELECT site_id INTO story_site_id
    FROM storyrail.stories WHERE story_id = NEW.story_id;
    IF source_site_id IS NULL OR story_site_id IS NULL
      OR source_site_id IS DISTINCT FROM story_site_id
    THEN
      RAISE EXCEPTION 'policy run % cannot change tenant while changing root', OLD.policy_run_id
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER policy_runs_progress_only
  BEFORE UPDATE ON storyrail.policy_runs
  FOR EACH ROW EXECUTE FUNCTION storyrail.policy_run_progress_only();

COMMIT;
