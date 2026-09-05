BEGIN;

-- An operator's answer to an ambiguous pre-instance delivery is an audit fact. It is appended,
-- never folded into the historical delivery: that delivery truthfully did not know which
-- installation it addressed when it was recorded.
CREATE TABLE storyrail.legacy_delivery_mapping_resolutions (
  resolution_id text PRIMARY KEY,
  insertion_position bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  story_id text NOT NULL REFERENCES storyrail.stories (story_id),
  legacy_delivery_id text NOT NULL REFERENCES storyrail.story_deliveries (delivery_id),
  destination text NOT NULL,
  destination_instance_id text NOT NULL,
  remote_id text NOT NULL,
  decision text NOT NULL,
  decided_at text NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT legacy_delivery_mapping_resolutions_identity_format_check CHECK (
    resolution_id <> '' AND resolution_id = btrim(resolution_id)
    AND story_id <> '' AND story_id = btrim(story_id)
    AND legacy_delivery_id <> '' AND legacy_delivery_id = btrim(legacy_delivery_id)
  ),
  CONSTRAINT legacy_delivery_mapping_resolutions_destination_format_check CHECK (
    destination <> '' AND destination = btrim(destination)
    AND destination ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),
  CONSTRAINT legacy_delivery_mapping_resolutions_instance_format_check CHECK (
    destination_instance_id <> '' AND destination_instance_id = btrim(destination_instance_id)
  ),
  CONSTRAINT legacy_delivery_mapping_resolutions_remote_id_format_check CHECK (
    remote_id <> '' AND remote_id = btrim(remote_id)
  ),
  CONSTRAINT legacy_delivery_mapping_resolutions_decision_check CHECK (
    decision IN ('confirm', 'dismiss')
  ),
  CONSTRAINT legacy_delivery_mapping_resolutions_decided_at_format_check CHECK (
    decided_at <> '' AND decided_at = btrim(decided_at)
  ),
  CONSTRAINT legacy_delivery_mapping_resolutions_payload_shape_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','storyId','legacyDeliveryId','destination','destinationInstanceId','remoteId','decision','decidedBy','decidedAt']
    AND payload - ARRAY['id','storyId','legacyDeliveryId','destination','destinationInstanceId','remoteId','decision','decidedBy','decidedAt'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'id') = 'string'
    AND jsonb_typeof(payload -> 'storyId') = 'string'
    AND jsonb_typeof(payload -> 'legacyDeliveryId') = 'string'
    AND jsonb_typeof(payload -> 'destination') = 'string'
    AND jsonb_typeof(payload -> 'destinationInstanceId') = 'string'
    AND jsonb_typeof(payload -> 'remoteId') = 'string'
    AND jsonb_typeof(payload -> 'decision') = 'string'
    AND jsonb_typeof(payload -> 'decidedAt') = 'string'
    AND payload ->> 'id' = resolution_id
    AND payload ->> 'storyId' = story_id
    AND payload ->> 'legacyDeliveryId' = legacy_delivery_id
    AND payload ->> 'destination' = destination
    AND payload ->> 'destinationInstanceId' = destination_instance_id
    AND payload ->> 'remoteId' = remote_id
    AND payload ->> 'decision' = decision
    AND payload ->> 'decidedAt' = decided_at
    AND jsonb_typeof(payload -> 'decidedBy') = 'object'
    AND payload -> 'decidedBy' ?& ARRAY['type','operatorId']
    AND (payload -> 'decidedBy') - ARRAY['type','operatorId'] = '{}'::jsonb
    AND payload -> 'decidedBy' ->> 'type' = 'operator'
    AND jsonb_typeof(payload -> 'decidedBy' -> 'operatorId') = 'string'
    AND btrim(payload -> 'decidedBy' ->> 'operatorId') <> ''
    AND payload -> 'decidedBy' ->> 'operatorId' = btrim(payload -> 'decidedBy' ->> 'operatorId')
  )
);

CREATE INDEX legacy_delivery_mapping_resolutions_latest_idx
  ON storyrail.legacy_delivery_mapping_resolutions
    (story_id, legacy_delivery_id, destination_instance_id, insertion_position DESC);

-- The foreign key proves the referenced delivery exists. This trigger proves it is precisely the
-- immutable legacy success the resolution snapshots, instead of trusting every writer to join
-- and compare all five facts correctly.
CREATE FUNCTION storyrail.legacy_delivery_mapping_resolution_is_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storyrail.story_deliveries AS delivery
    WHERE delivery.delivery_id = NEW.legacy_delivery_id
      AND delivery.story_id = NEW.story_id
      AND delivery.destination = NEW.destination
      AND delivery.destination_instance_id IS NULL
      AND delivery.remote_id = NEW.remote_id
      AND delivery.outcome = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'resolution % does not snapshot a succeeded legacy delivery', NEW.resolution_id
      USING ERRCODE = 'foreign_key_violation',
            CONSTRAINT = 'legacy_delivery_mapping_resolutions_legacy_snapshot_fk';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER legacy_delivery_mapping_resolutions_validate_legacy
  BEFORE INSERT ON storyrail.legacy_delivery_mapping_resolutions
  FOR EACH ROW EXECUTE FUNCTION storyrail.legacy_delivery_mapping_resolution_is_valid();

CREATE FUNCTION storyrail.legacy_delivery_mapping_resolutions_are_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'legacy delivery mapping resolutions may not be changed or deleted'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER legacy_delivery_mapping_resolutions_append_only
  BEFORE UPDATE OR DELETE ON storyrail.legacy_delivery_mapping_resolutions
  FOR EACH ROW EXECUTE FUNCTION storyrail.legacy_delivery_mapping_resolutions_are_append_only();

COMMIT;
