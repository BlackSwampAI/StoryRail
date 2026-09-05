BEGIN;

-- A connector name identifies software, not the particular installation it writes to. Keep the
-- durable destination identity beside every new delivery so a remote page identifier recovered
-- from one installation can never be applied to another. Historical rows remain deliberately
-- unbound: an operator must confirm or dismiss that mapping before it can be reused.
ALTER TABLE storyrail.story_deliveries
  ADD COLUMN destination_instance_id text;

ALTER TABLE storyrail.story_deliveries
  DROP CONSTRAINT story_deliveries_payload_shape_check;

-- The one-time payload backfill is maintenance, not a second completion. Suspend the immutable
-- row guard while adding the null legacy marker, then recreate it below with the new identity.
DROP TRIGGER story_deliveries_completes_once ON storyrail.story_deliveries;

UPDATE storyrail.story_deliveries
  SET payload = jsonb_set(payload, '{destinationInstanceId}', 'null'::jsonb);

ALTER TABLE storyrail.story_deliveries
  ADD CONSTRAINT story_deliveries_destination_instance_id_format_check CHECK (
    destination_instance_id IS NULL
    OR (destination_instance_id <> '' AND destination_instance_id = btrim(destination_instance_id))
  ),
  ADD CONSTRAINT story_deliveries_payload_shape_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','storyId','revisionId','destination','destinationInstanceId','remoteId','request','startedAt','completedAt','outcome']
    AND (
      (outcome = 'running'
       AND jsonb_typeof(payload -> 'completedAt') = 'null'
       AND payload - ARRAY['id','storyId','revisionId','destination','destinationInstanceId','remoteId','request','startedAt','completedAt','outcome'] = '{}'::jsonb)
      OR (outcome = 'succeeded'
       AND payload ? 'result'
       AND payload - ARRAY['id','storyId','revisionId','destination','destinationInstanceId','remoteId','request','startedAt','completedAt','outcome','result'] = '{}'::jsonb)
      OR (outcome = 'failed'
       AND payload ? 'failure'
       AND payload - ARRAY['id','storyId','revisionId','destination','destinationInstanceId','remoteId','request','startedAt','completedAt','outcome','failure'] = '{}'::jsonb)
    )
    AND payload ->> 'id' = delivery_id
    AND payload ->> 'storyId' = story_id
    AND payload ->> 'revisionId' = revision_id
    AND payload ->> 'destination' = destination
    AND (
      (destination_instance_id IS NULL AND jsonb_typeof(payload -> 'destinationInstanceId') = 'null')
      OR (
        destination_instance_id IS NOT NULL
        AND jsonb_typeof(payload -> 'destinationInstanceId') = 'string'
        AND payload ->> 'destinationInstanceId' = destination_instance_id
      )
    )
    AND (
      (remote_id IS NULL AND jsonb_typeof(payload -> 'remoteId') = 'null')
      OR payload ->> 'remoteId' = remote_id
    )
    AND payload ->> 'outcome' = outcome
    AND jsonb_typeof(payload -> 'request') = 'object'
    AND payload -> 'request' ?& ARRAY['operation', 'slug']
    AND payload -> 'request' ->> 'operation' IN ('create', 'update')
    AND jsonb_typeof(payload -> 'request' -> 'slug') = 'string'
    AND btrim(payload -> 'request' ->> 'slug') <> ''
    AND jsonb_typeof(payload -> 'startedAt') = 'string'
    AND btrim(payload ->> 'startedAt') <> ''
    AND (
      outcome = 'running'
      OR (jsonb_typeof(payload -> 'completedAt') = 'string' AND btrim(payload ->> 'completedAt') <> '')
    )
    AND length(payload -> 'request' #>> '{}') <= 4000
    AND (NOT payload ? 'result' OR length(payload -> 'result' #>> '{}') <= 4000)
  );

-- Replace the connector-name lookup with the identity that names one configured installation.
DROP INDEX storyrail.story_deliveries_story_destination_idx;

CREATE INDEX story_deliveries_story_destination_instance_idx
  ON storyrail.story_deliveries (story_id, destination_instance_id, started_at DESC)
  WHERE destination_instance_id IS NOT NULL;

-- Legacy mappings are queried separately so their existence can block automatic reuse without
-- ever pretending that they belong to the currently configured installation.
CREATE INDEX story_deliveries_legacy_story_destination_idx
  ON storyrail.story_deliveries (story_id, destination, started_at DESC)
  WHERE destination_instance_id IS NULL;

CREATE FUNCTION storyrail.story_delivery_requires_destination_instance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.destination_instance_id IS NULL THEN
    RAISE EXCEPTION 'new delivery % requires a destination instance identity', NEW.delivery_id
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'story_deliveries_destination_instance_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER story_deliveries_destination_instance_required
  BEFORE INSERT ON storyrail.story_deliveries
  FOR EACH ROW EXECUTE FUNCTION storyrail.story_delivery_requires_destination_instance();

-- Completion may fill the remote identifier, but it may not rebind the attempt to another
-- configured installation. Extend the existing completes-once guard to cover the new identity.
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
    OR NEW.payload -> 'request' <> OLD.payload -> 'request'
  THEN
    RAISE EXCEPTION 'delivery % cannot change what it sent', OLD.delivery_id
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER story_deliveries_completes_once
  BEFORE UPDATE ON storyrail.story_deliveries
  FOR EACH ROW EXECUTE FUNCTION storyrail.story_delivery_completes_once();

COMMIT;
