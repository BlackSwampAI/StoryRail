BEGIN;

-- A delivery whose process died is left running forever: the destination may or may not have
-- made the page, and nothing closes the row. Recovery must age it by a clock the caller cannot
-- supply, exactly as 0079 does for AgentRuns. started_at is a model-side timestamp written by
-- the process that may have died, so it cannot say when PostgreSQL accepted the intent.
--
-- Existing running rows receive the migration instant, giving their processes a full recovery
-- window after deployment instead of declaring them abandoned immediately.
ALTER TABLE storyrail.story_deliveries
  ADD COLUMN recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX story_deliveries_stale_running_idx
  ON storyrail.story_deliveries (recorded_at ASC, delivery_id ASC)
  WHERE outcome = 'running';

-- Same guard as 0076, additionally refusing to move the recovery instant on completion. A stuck
-- delivery settles to 'unknown' through the ordinary completion path, which needs no other
-- change: an update already carries the remote_id 0078 requires of an uncertain update, and a
-- create carries none, which is what 0078 requires of an uncertain create.
CREATE OR REPLACE FUNCTION storyrail.story_delivery_completes_once()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.outcome <> 'running' THEN
    RAISE EXCEPTION 'delivery % is already complete', OLD.delivery_id
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.outcome = 'running' THEN
    RAISE EXCEPTION 'delivery % cannot return to running', OLD.delivery_id
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.delivery_id <> OLD.delivery_id
    OR NEW.story_id <> OLD.story_id
    OR NEW.revision_id <> OLD.revision_id
    OR NEW.destination <> OLD.destination
    OR NEW.destination_instance_id IS DISTINCT FROM OLD.destination_instance_id
    OR (OLD.remote_id IS NOT NULL AND NEW.remote_id IS DISTINCT FROM OLD.remote_id)
    OR NEW.started_at <> OLD.started_at
    OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
    OR NEW.payload -> 'request' <> OLD.payload -> 'request'
  THEN
    RAISE EXCEPTION 'delivery % cannot change what it sent', OLD.delivery_id
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
