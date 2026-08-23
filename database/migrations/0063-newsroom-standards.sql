BEGIN;

-- The three built-in Agent Profiles carry one sentence of instructions each. That sentence is
-- the entire editorial voice of the newsroom, and it is not editable: built-in profiles are
-- immutable identities and only custom Writer profiles can be created.
--
-- Newsroom standards sit alongside them instead of replacing them. One document, written by the
-- operator, appended to every role's system prompt — so a single edit reaches the Assignment
-- Editor, Researcher, Writer, and Director at once, which is what a house style is.
--
-- Revisions are append-only and timestamped rather than a mutable row, so the standards a run
-- worked under can be read back from when that run started. Copying them onto every AgentRun
-- would be a second source of truth for something both records already fix in time.

CREATE TABLE storyrail.newsroom_standards (
  standards_id text PRIMARY KEY,
  revision_number integer NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  append_position bigint GENERATED ALWAYS AS IDENTITY,
  CONSTRAINT newsroom_standards_revision_check CHECK (revision_number >= 1),
  CONSTRAINT newsroom_standards_payload_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id', 'revisionNumber', 'text', 'updatedBy', 'updatedAt']
    AND payload - ARRAY['id', 'revisionNumber', 'text', 'updatedBy', 'updatedAt'] = '{}'::jsonb
    AND payload ->> 'id' = standards_id
    AND (payload ->> 'revisionNumber')::integer = revision_number
    AND jsonb_typeof(payload -> 'text') = 'string'
    AND btrim(payload ->> 'text') <> ''
    AND payload ->> 'text' = btrim(payload ->> 'text')
    -- Long enough for a real style guide, short enough that it cannot crowd out the evidence.
    AND length(payload ->> 'text') <= 8000
    AND payload -> 'updatedBy' = jsonb_build_object(
      'type', 'operator', 'operatorId', payload -> 'updatedBy' -> 'operatorId'
    )
    AND jsonb_typeof(payload -> 'updatedBy' -> 'operatorId') = 'string'
    AND btrim(payload -> 'updatedBy' ->> 'operatorId') <> ''
    AND jsonb_typeof(payload -> 'updatedAt') = 'string'
    AND btrim(payload ->> 'updatedAt') <> ''
  )
);

-- Standards are history, not state. A revision is written once and never edited.
CREATE FUNCTION storyrail.newsroom_standards_are_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'newsroom standards revision % cannot be changed once written', OLD.revision_number
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER newsroom_standards_append_only
  BEFORE UPDATE OR DELETE ON storyrail.newsroom_standards
  FOR EACH ROW EXECUTE FUNCTION storyrail.newsroom_standards_are_append_only();

COMMIT;
