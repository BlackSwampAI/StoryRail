BEGIN;

CREATE TABLE storyrail.source_triage_decisions (
  source_id text PRIMARY KEY,
  decision text NOT NULL,
  story_id text,
  payload jsonb NOT NULL,
  CONSTRAINT source_triage_decisions_source_id_fkey
    FOREIGN KEY (source_id)
    REFERENCES storyrail.url_sources (source_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT source_triage_decisions_story_source_attachment_fkey
    FOREIGN KEY (story_id, source_id)
    REFERENCES storyrail.story_source_attachments (story_id, source_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT source_triage_decisions_decision_check
    CHECK (decision IN ('new_story', 'existing_story', 'skip')),
  CONSTRAINT source_triage_decisions_story_shape_check
    CHECK (
      (decision = 'skip' AND story_id IS NULL)
      OR
      (decision IN ('new_story', 'existing_story') AND story_id IS NOT NULL)
    ),
  CONSTRAINT source_triage_decisions_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT source_triage_decisions_payload_shape_check
    CHECK (
      payload = jsonb_build_object(
        'sourceId', payload -> 'sourceId',
        'decision', payload -> 'decision',
        'storyId', payload -> 'storyId',
        'reason', payload -> 'reason',
        'decidedBy', payload -> 'decidedBy',
        'decidedAt', payload -> 'decidedAt'
      )
    ),
  CONSTRAINT source_triage_decisions_payload_relational_check
    CHECK (
      jsonb_typeof(payload -> 'sourceId') = 'string'
      AND payload ->> 'sourceId' = source_id
      AND jsonb_typeof(payload -> 'decision') = 'string'
      AND payload ->> 'decision' = decision
      AND (
        (story_id IS NULL AND jsonb_typeof(payload -> 'storyId') = 'null')
        OR
        (
          story_id IS NOT NULL
          AND jsonb_typeof(payload -> 'storyId') = 'string'
          AND payload ->> 'storyId' = story_id
        )
      )
    ),
  CONSTRAINT source_triage_decisions_payload_reason_check
    CHECK (
      jsonb_typeof(payload -> 'reason') = 'string'
      AND length(payload ->> 'reason') > 0
      AND payload ->> 'reason' = btrim(payload ->> 'reason')
    ),
  CONSTRAINT source_triage_decisions_payload_decided_at_check
    CHECK (jsonb_typeof(payload -> 'decidedAt') = 'string'),
  CONSTRAINT source_triage_decisions_payload_decided_by_check
    CHECK (
      jsonb_typeof(payload -> 'decidedBy') = 'object'
      AND (
        (
          payload -> 'decidedBy' = jsonb_build_object(
            'type', 'operator',
            'operatorId', payload -> 'decidedBy' -> 'operatorId'
          )
          AND jsonb_typeof(payload -> 'decidedBy' -> 'operatorId') = 'string'
        )
        OR
        (
          payload -> 'decidedBy' = jsonb_build_object(
            'type', 'agent',
            'role', payload -> 'decidedBy' -> 'role',
            'runId', payload -> 'decidedBy' -> 'runId'
          )
          AND jsonb_typeof(payload -> 'decidedBy' -> 'role') = 'string'
          AND payload -> 'decidedBy' ->> 'role' IN (
            'assignment_editor',
            'writer',
            'fact_checker',
            'editor_in_chief'
          )
          AND jsonb_typeof(payload -> 'decidedBy' -> 'runId') = 'string'
        )
      )
    )
);

CREATE FUNCTION storyrail.reject_attached_source_skip()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.decision = 'skip' AND EXISTS (
    SELECT 1
    FROM storyrail.story_source_attachments
    WHERE source_id = NEW.source_id
  ) THEN
    RAISE EXCEPTION 'an attached Source cannot be skipped'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER source_triage_decisions_skip_attachment_check
BEFORE INSERT OR UPDATE ON storyrail.source_triage_decisions
FOR EACH ROW EXECUTE FUNCTION storyrail.reject_attached_source_skip();

COMMIT;
