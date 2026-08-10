BEGIN;

CREATE TABLE storyrail.story_source_attachments (
  story_id text NOT NULL,
  source_id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (story_id, source_id),
  CONSTRAINT story_source_attachments_story_id_fkey
    FOREIGN KEY (story_id)
    REFERENCES storyrail.stories (story_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT story_source_attachments_source_id_fkey
    FOREIGN KEY (source_id)
    REFERENCES storyrail.url_sources (source_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT story_source_attachments_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT story_source_attachments_payload_shape_check
    CHECK (
      payload = jsonb_build_object(
        'storyId', payload -> 'storyId',
        'sourceId', payload -> 'sourceId',
        'relevance', payload -> 'relevance',
        'attachedBy', payload -> 'attachedBy',
        'attachedAt', payload -> 'attachedAt'
      )
    ),
  CONSTRAINT story_source_attachments_payload_story_id_check
    CHECK (
      payload ? 'storyId'
      AND jsonb_typeof(payload -> 'storyId') = 'string'
      AND payload ->> 'storyId' = story_id
    ),
  CONSTRAINT story_source_attachments_payload_source_id_check
    CHECK (
      payload ? 'sourceId'
      AND jsonb_typeof(payload -> 'sourceId') = 'string'
      AND payload ->> 'sourceId' = source_id
    ),
  CONSTRAINT story_source_attachments_payload_relevance_check
    CHECK (
      payload ? 'relevance'
      AND jsonb_typeof(payload -> 'relevance') = 'string'
    ),
  CONSTRAINT story_source_attachments_payload_attached_at_check
    CHECK (
      payload ? 'attachedAt'
      AND jsonb_typeof(payload -> 'attachedAt') = 'string'
    ),
  CONSTRAINT story_source_attachments_payload_attached_by_check
    CHECK (
      payload ? 'attachedBy'
      AND jsonb_typeof(payload -> 'attachedBy') = 'object'
      AND (
        (
          payload -> 'attachedBy' = jsonb_build_object(
            'type', 'operator',
            'operatorId', payload -> 'attachedBy' -> 'operatorId'
          )
          AND jsonb_typeof(payload -> 'attachedBy' -> 'operatorId') = 'string'
        )
        OR
        (
          payload -> 'attachedBy' = jsonb_build_object(
            'type', 'agent',
            'role', payload -> 'attachedBy' -> 'role',
            'runId', payload -> 'attachedBy' -> 'runId'
          )
          AND jsonb_typeof(payload -> 'attachedBy' -> 'role') = 'string'
          AND payload -> 'attachedBy' ->> 'role' IN (
            'assignment_editor',
            'writer',
            'fact_checker',
            'editor_in_chief'
          )
          AND jsonb_typeof(payload -> 'attachedBy' -> 'runId') = 'string'
        )
      )
    )
);

COMMIT;
