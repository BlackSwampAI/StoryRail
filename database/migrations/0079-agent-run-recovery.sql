BEGIN;

-- Recovery age is based on when PostgreSQL accepted the intent, not on a caller-supplied model
-- timestamp. Existing running rows receive the migration instant, giving their processes a full
-- recovery window after deployment instead of declaring them abandoned immediately.
ALTER TABLE storyrail.agent_runs
  ADD COLUMN recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX agent_runs_stale_running_idx
  ON storyrail.agent_runs (recorded_at ASC, append_position ASC)
  WHERE outcome = 'running';

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
     OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
     OR NEW.payload -> 'input' IS DISTINCT FROM OLD.payload -> 'input'
     OR NEW.payload ->> 'startedAt' IS DISTINCT FROM OLD.payload ->> 'startedAt' THEN
    RAISE EXCEPTION 'agent run % may only record its completion', OLD.run_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
