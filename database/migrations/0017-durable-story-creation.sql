BEGIN;

CREATE TABLE storyrail.stories (
  story_id text PRIMARY KEY,
  state text NOT NULL,
  revision_cycle integer NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT stories_state_check
    CHECK (
      state IN (
        'intake',
        'assigned',
        'in_progress',
        'in_review',
        'changes_requested',
        'approved',
        'rejected',
        'published'
      )
    ),
  CONSTRAINT stories_revision_cycle_check
    CHECK (revision_cycle BETWEEN 0 AND 2),
  CONSTRAINT stories_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT stories_payload_id_check
    CHECK (
      payload ? 'id'
      AND jsonb_typeof(payload -> 'id') = 'string'
      AND payload ->> 'id' = story_id
    ),
  CONSTRAINT stories_payload_state_check
    CHECK (
      payload ? 'state'
      AND jsonb_typeof(payload -> 'state') = 'string'
      AND payload ->> 'state' = state
    ),
  CONSTRAINT stories_payload_revision_cycle_check
    CHECK (
      payload ? 'revisionCycle'
      AND jsonb_typeof(payload -> 'revisionCycle') = 'number'
      AND (payload ->> 'revisionCycle')::integer = revision_cycle
      AND (payload ->> 'revisionCycle') = revision_cycle::text
    ),
  CONSTRAINT stories_payload_title_check
    CHECK (
      payload ? 'title'
      AND jsonb_typeof(payload -> 'title') = 'string'
    ),
  CONSTRAINT stories_payload_created_at_check
    CHECK (
      payload ? 'createdAt'
      AND jsonb_typeof(payload -> 'createdAt') = 'string'
    ),
  CONSTRAINT stories_payload_updated_at_check
    CHECK (
      payload ? 'updatedAt'
      AND jsonb_typeof(payload -> 'updatedAt') = 'string'
    )
);

COMMIT;
