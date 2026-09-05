BEGIN;

-- A request can leave StoryRail without a trustworthy response. That is neither success nor
-- failure: retrying a create could duplicate a page, while treating an update as failed could
-- conceal a change which was actually accepted. Preserve that uncertainty as a terminal outcome.
ALTER TABLE storyrail.story_deliveries
  DROP CONSTRAINT story_deliveries_outcome_check,
  DROP CONSTRAINT story_deliveries_payload_shape_check;

ALTER TABLE storyrail.story_deliveries
  ADD CONSTRAINT story_deliveries_outcome_check CHECK (
    outcome IN ('running', 'succeeded', 'failed', 'unknown')
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
      OR (outcome = 'unknown'
       AND payload ? 'uncertainty'
       AND payload - ARRAY['id','storyId','revisionId','destination','destinationInstanceId','remoteId','request','startedAt','completedAt','outcome','uncertainty'] = '{}'::jsonb)
    )
    AND payload ->> 'id' = delivery_id
    AND payload ->> 'storyId' = story_id
    AND payload ->> 'revisionId' = revision_id
    AND payload ->> 'destination' = destination
    AND (
      (destination_instance_id IS NULL AND jsonb_typeof(payload -> 'destinationInstanceId') = 'null')
      OR (destination_instance_id IS NOT NULL
          AND jsonb_typeof(payload -> 'destinationInstanceId') = 'string'
          AND payload ->> 'destinationInstanceId' = destination_instance_id)
    )
    AND ((remote_id IS NULL AND jsonb_typeof(payload -> 'remoteId') = 'null')
         OR payload ->> 'remoteId' = remote_id)
    AND payload ->> 'outcome' = outcome
    AND jsonb_typeof(payload -> 'request') = 'object'
    AND payload -> 'request' ?& ARRAY['operation','slug']
    AND payload -> 'request' ->> 'operation' IN ('create','update')
    AND jsonb_typeof(payload -> 'request' -> 'slug') = 'string'
    AND btrim(payload -> 'request' ->> 'slug') <> ''
    AND jsonb_typeof(payload -> 'startedAt') = 'string'
    AND btrim(payload ->> 'startedAt') <> ''
    AND (outcome = 'running'
         OR (jsonb_typeof(payload -> 'completedAt') = 'string'
             AND btrim(payload ->> 'completedAt') <> ''))
    AND length(payload -> 'request' #>> '{}') <= 4000
    AND (NOT payload ? 'result' OR length(payload -> 'result' #>> '{}') <= 4000)
    AND (NOT payload ? 'uncertainty' OR length(payload -> 'uncertainty' #>> '{}') <= 4000)
  ),
  -- Creates know no remote identity while uncertain. Updates must retain the exact identity they
  -- were already addressing; this is what later reconciliation is allowed to confirm.
  ADD CONSTRAINT story_deliveries_unknown_remote_id_check CHECK (
    outcome <> 'unknown'
    OR ((payload -> 'request' ->> 'operation' = 'create' AND remote_id IS NULL)
        OR (payload -> 'request' ->> 'operation' = 'update' AND remote_id IS NOT NULL))
  ),
  ADD CONSTRAINT story_deliveries_uncertainty_check CHECK (
    outcome <> 'unknown'
    OR (jsonb_typeof(payload -> 'uncertainty') = 'object'
        AND (payload -> 'uncertainty') ?& ARRAY['code','message']
        AND (payload -> 'uncertainty') - ARRAY['code','message'] = '{}'::jsonb
        AND payload -> 'uncertainty' ->> 'code' IN (
          'DESTINATION_REQUEST_OUTCOME_UNKNOWN',
          'DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE'
        )
        AND (jsonb_typeof(payload -> 'uncertainty' -> 'message') = 'null'
             OR (jsonb_typeof(payload -> 'uncertainty' -> 'message') = 'string'
                 AND btrim(payload -> 'uncertainty' ->> 'message') <> ''
                 AND payload -> 'uncertainty' ->> 'message'
                     = btrim(payload -> 'uncertainty' ->> 'message'))))
  );

CREATE INDEX story_deliveries_unresolved_story_instance_idx
  ON storyrail.story_deliveries
    (story_id, destination_instance_id, started_at DESC, delivery_id DESC)
  WHERE outcome IN ('running', 'unknown') AND destination_instance_id IS NOT NULL;

CREATE TABLE storyrail.story_delivery_reconciliations (
  reconciliation_id text PRIMARY KEY,
  insertion_position bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  story_id text NOT NULL REFERENCES storyrail.stories (story_id),
  delivery_id text NOT NULL REFERENCES storyrail.story_deliveries (delivery_id),
  destination text NOT NULL,
  destination_instance_id text NOT NULL,
  operation text NOT NULL,
  slug text NOT NULL,
  decision text NOT NULL,
  remote_id text,
  decided_at text NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT story_delivery_reconciliations_identity_format_check CHECK (
    reconciliation_id <> '' AND reconciliation_id = btrim(reconciliation_id)
    AND story_id <> '' AND story_id = btrim(story_id)
    AND delivery_id <> '' AND delivery_id = btrim(delivery_id)
  ),
  CONSTRAINT story_delivery_reconciliations_destination_format_check CHECK (
    destination <> '' AND destination = btrim(destination)
    AND destination ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
    AND destination_instance_id <> ''
    AND destination_instance_id = btrim(destination_instance_id)
  ),
  CONSTRAINT story_delivery_reconciliations_request_format_check CHECK (
    operation IN ('create','update') AND slug <> '' AND slug = btrim(slug)
  ),
  CONSTRAINT story_delivery_reconciliations_decision_check CHECK (
    (decision = 'delivered' AND remote_id IS NOT NULL)
    OR (decision = 'not_delivered' AND remote_id IS NULL)
  ),
  CONSTRAINT story_delivery_reconciliations_remote_id_format_check CHECK (
    remote_id IS NULL OR (remote_id <> '' AND remote_id = btrim(remote_id))
  ),
  CONSTRAINT story_delivery_reconciliations_decided_at_format_check CHECK (
    decided_at <> '' AND decided_at = btrim(decided_at)
  ),
  CONSTRAINT story_delivery_reconciliations_payload_shape_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','storyId','deliveryId','destination','destinationInstanceId','operation','slug','decision','remoteId','decidedBy','decidedAt']
    AND payload - ARRAY['id','storyId','deliveryId','destination','destinationInstanceId','operation','slug','decision','remoteId','decidedBy','decidedAt'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'id') = 'string'
    AND jsonb_typeof(payload -> 'storyId') = 'string'
    AND jsonb_typeof(payload -> 'deliveryId') = 'string'
    AND jsonb_typeof(payload -> 'destination') = 'string'
    AND jsonb_typeof(payload -> 'destinationInstanceId') = 'string'
    AND jsonb_typeof(payload -> 'operation') = 'string'
    AND jsonb_typeof(payload -> 'slug') = 'string'
    AND jsonb_typeof(payload -> 'decision') = 'string'
    AND payload ->> 'id' = reconciliation_id
    AND payload ->> 'storyId' = story_id
    AND payload ->> 'deliveryId' = delivery_id
    AND payload ->> 'destination' = destination
    AND payload ->> 'destinationInstanceId' = destination_instance_id
    AND payload ->> 'operation' = operation
    AND payload ->> 'slug' = slug
    AND payload ->> 'decision' = decision
    AND ((remote_id IS NULL AND jsonb_typeof(payload -> 'remoteId') = 'null')
         OR (remote_id IS NOT NULL
             AND jsonb_typeof(payload -> 'remoteId') = 'string'
             AND payload ->> 'remoteId' = remote_id))
    AND jsonb_typeof(payload -> 'decidedAt') = 'string'
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

CREATE INDEX story_delivery_reconciliations_latest_idx
  ON storyrail.story_delivery_reconciliations
    (story_id, delivery_id, destination_instance_id, insertion_position DESC);

CREATE FUNCTION storyrail.story_delivery_reconciliation_is_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storyrail.story_deliveries AS delivery
    WHERE delivery.delivery_id = NEW.delivery_id
      AND delivery.story_id = NEW.story_id
      AND delivery.destination = NEW.destination
      AND delivery.destination_instance_id = NEW.destination_instance_id
      AND delivery.outcome IN ('running','unknown')
      AND delivery.payload -> 'request' ->> 'operation' = NEW.operation
      AND delivery.payload -> 'request' ->> 'slug' = NEW.slug
      AND (NEW.decision <> 'delivered' OR NEW.operation <> 'update'
           OR NEW.remote_id = delivery.remote_id)
  ) THEN
    RAISE EXCEPTION 'reconciliation % does not snapshot its unresolved delivery', NEW.reconciliation_id
      USING ERRCODE = 'foreign_key_violation',
            CONSTRAINT = 'story_delivery_reconciliations_delivery_snapshot_fk';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER story_delivery_reconciliations_validate_delivery
  BEFORE INSERT ON storyrail.story_delivery_reconciliations
  FOR EACH ROW EXECUTE FUNCTION storyrail.story_delivery_reconciliation_is_valid();

CREATE FUNCTION storyrail.story_delivery_reconciliations_are_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'story delivery reconciliations may not be changed or deleted'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER story_delivery_reconciliations_append_only
  BEFORE UPDATE OR DELETE ON storyrail.story_delivery_reconciliations
  FOR EACH ROW EXECUTE FUNCTION storyrail.story_delivery_reconciliations_are_append_only();

COMMIT;
