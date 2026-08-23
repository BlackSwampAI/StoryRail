BEGIN;

-- The newsroom could not read its own archive. Every published Article was durable and none of
-- it was reachable from a run, so a Story about a subject the newsroom had already covered was
-- researched from nothing, as though the earlier reporting had never happened.
--
-- This makes a published Revision findable by its words. It adds no new record: the searchable
-- text is derived from the Revision payload that already exists, so there is no second copy of
-- an Article to fall out of step with the blocks it was built from.
--
-- Prior reporting is deliberately not made citable here. A Revision has no evidence record, so
-- a citation naming one is refused by the same grounding check every other citation goes
-- through. The archive tells an agent what the newsroom already said; it never becomes the
-- support for a new claim.

CREATE FUNCTION storyrail.article_revision_text(payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT concat_ws(
    ' ',
    payload ->> 'headline',
    payload ->> 'dek',
    (
      SELECT string_agg(entry.block ->> 'markdown', ' ' ORDER BY entry.ordinality)
      FROM jsonb_array_elements(payload -> 'blocks') WITH ORDINALITY AS entry(block, ordinality)
    )
  )
$$;

ALTER TABLE storyrail.article_revisions
  ADD COLUMN search_text tsvector
    GENERATED ALWAYS AS (to_tsvector('english', storyrail.article_revision_text(payload))) STORED;

CREATE INDEX article_revisions_search_text_idx
  ON storyrail.article_revisions USING GIN (search_text);

COMMIT;
