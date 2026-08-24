BEGIN;

-- Publication says a Story is ready to go; it has never said where it went. Delivery is that
-- second fact, and it is the first time StoryRail writes to anywhere but its own database.
--
-- It follows agent_tool_calls exactly, and for the reason 0062 gives: reaching outside the
-- system is the act that must not be able to happen unrecorded. The row is written while the
-- delivery is still an intention, so a process that dies mid-request leaves a running row that
-- an operator can see rather than a page on a website nothing here knows about.
--
-- There is no site_id. A delivery descends from exactly one Story and inherits that Story's Site
-- through the descent, so a column here could only ever be a second copy able to disagree.

CREATE TABLE storyrail.story_deliveries (
  delivery_id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES storyrail.stories (story_id),
  revision_id text NOT NULL REFERENCES storyrail.article_revisions (revision_id),
  -- An open name, never an enumerated one, for the reason agent_tool_calls.tool carries: the
  -- database records what was delivered to, it does not decide what may be delivered to. A
  -- second destination arrives without a migration.
  destination text NOT NULL,
  -- Null until the destination says what it made. The create endpoint discards any identifier
  -- sent to it and mints its own, so StoryRail cannot know one before the call and must not
  -- pretend to: a remote_id written in advance would name a page that does not exist under that
  -- name. A delivery that updates a page already made carries it from the start, because the
  -- prior successful delivery is where it came from.
  remote_id text,
  outcome text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  -- An audit fact, not a content store. What was sent is summarised and what came back is
  -- bounded: the Revision is already durable and immutable, so a copy of the prose here would
  -- be a second version of the same material with no way to say which one is authoritative.
  payload jsonb NOT NULL,
  CONSTRAINT story_deliveries_destination_format_check CHECK (
    destination <> ''
    AND destination = btrim(destination)
    AND destination ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),
  CONSTRAINT story_deliveries_remote_id_format_check CHECK (
    remote_id IS NULL OR (remote_id <> '' AND remote_id = btrim(remote_id))
  ),
  -- An accepted delivery always knows which page it wrote. Without this, a create whose answer
  -- could not be read would be recorded as a success naming nothing, and the next Revision
  -- would make a second page rather than updating the first.
  CONSTRAINT story_deliveries_succeeded_remote_id_check CHECK (
    outcome <> 'succeeded' OR remote_id IS NOT NULL
  ),
  CONSTRAINT story_deliveries_outcome_check CHECK (
    outcome IN ('running', 'succeeded', 'failed')
  ),
  -- Completion is what the outcome means, so the two cannot disagree.
  CONSTRAINT story_deliveries_completed_check CHECK (
    (outcome = 'running') = (completed_at IS NULL)
  ),
  CONSTRAINT story_deliveries_payload_shape_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','storyId','revisionId','destination','remoteId','request','startedAt','completedAt','outcome']
    AND (
      (outcome = 'running'
       AND jsonb_typeof(payload -> 'completedAt') = 'null'
       AND payload - ARRAY['id','storyId','revisionId','destination','remoteId','request','startedAt','completedAt','outcome'] = '{}'::jsonb)
      OR (outcome = 'succeeded'
       AND payload ? 'result'
       AND payload - ARRAY['id','storyId','revisionId','destination','remoteId','request','startedAt','completedAt','outcome','result'] = '{}'::jsonb)
      OR (outcome = 'failed'
       AND payload ? 'failure'
       AND payload - ARRAY['id','storyId','revisionId','destination','remoteId','request','startedAt','completedAt','outcome','failure'] = '{}'::jsonb)
    )
    AND payload ->> 'id' = delivery_id
    AND payload ->> 'storyId' = story_id
    AND payload ->> 'revisionId' = revision_id
    AND payload ->> 'destination' = destination
    AND (
      (remote_id IS NULL AND jsonb_typeof(payload -> 'remoteId') = 'null')
      OR payload ->> 'remoteId' = remote_id
    )
    AND payload ->> 'outcome' = outcome
    AND jsonb_typeof(payload -> 'request') = 'object'
    AND payload -> 'request' ?& ARRAY['operation', 'slug']
    AND payload -> 'request' ->> 'operation' IN ('create', 'update')
    -- The slug is the only identifier a running row can carry, because it is the only one
    -- StoryRail chooses. It is what an operator has to find a page a dead process left behind.
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
  ),
  CONSTRAINT story_deliveries_failure_check CHECK (
    outcome <> 'failed'
    OR (
      jsonb_typeof(payload -> 'failure') = 'object'
      AND (payload -> 'failure') ?& ARRAY['code','message']
      AND (payload -> 'failure') - ARRAY['code','message'] = '{}'::jsonb
      AND payload -> 'failure' ->> 'code' IN (
        'DESTINATION_UNREACHABLE',
        'DESTINATION_REJECTED',
        'DESTINATION_UNAUTHORIZED',
        'DESTINATION_RESPONSE_INVALID'
      )
      AND (
        jsonb_typeof(payload -> 'failure' -> 'message') = 'null'
        OR (
          jsonb_typeof(payload -> 'failure' -> 'message') = 'string'
          AND btrim(payload -> 'failure' ->> 'message') <> ''
        )
      )
    )
  )
);

-- The prior successful delivery is how a later Revision finds the page it must update rather
-- than creating a second one, so that lookup is the one this index exists for.
CREATE INDEX story_deliveries_story_destination_idx
  ON storyrail.story_deliveries (story_id, destination, started_at DESC);

-- A delivery completes exactly once and never reopens, as a tool call does. A failed delivery
-- that could be reopened would let a retry nobody saw overwrite the record of the failure.
CREATE FUNCTION storyrail.story_delivery_completes_once()
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
    -- A page StoryRail was already updating cannot become a different page on completion. One
    -- it was creating learns its identifier here, which is the only time remote_id may change.
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
