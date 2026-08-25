BEGIN;

-- A Site was a tenant boundary that an operator could neither see nor change: one was created by
-- migration, the process picked it from the environment, and nothing in the product could make a
-- second. Sites now live in the URL and are created from the newsroom, which turns three things
-- that were merely unreachable into things an operator can reach on their first afternoon.

-- A hostname identifies one website. Two Sites claiming the same one is a mistake someone made
-- while typing, and the only honest place to catch it is where the row is written. The domain
-- lives inside `payload`, so this is a unique index on the expression rather than a column
-- constraint.
--
-- The check comes first. There is one Site in this installation today, so nothing can be in the
-- way now, but a database that has run ahead of this migration would otherwise meet a failure
-- that says only "could not create unique index" and names no row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storyrail.sites
    GROUP BY payload ->> 'domain'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Two or more Sites already claim the same domain; resolve them before a unique index can exist.';
  END IF;
END
$$;

CREATE UNIQUE INDEX sites_domain_unique_index ON storyrail.sites ((payload ->> 'domain'));

-- An Assignment validated its Writer against `agent_profiles` with no Site in the predicate. That
-- was unreachable while one Site had every Profile and every lookup was already scoped, but this
-- is the migration that makes a second populated Site exist, which is exactly when an unreachable
-- cross-tenant path stops being unreachable. As with a Story attaching a Source, the pair itself
-- becomes the thing PostgreSQL checks.
ALTER TABLE storyrail.agent_profiles
  ADD CONSTRAINT agent_profiles_profile_role_site_key UNIQUE (profile_id, role, site_id);

ALTER TABLE storyrail.story_assignments ADD COLUMN site_id text;

-- An Assignment cannot disagree with the Story it belongs to, so its Site is read from there
-- rather than supplied.
UPDATE storyrail.story_assignments AS assignment
SET site_id = story.site_id
FROM storyrail.stories AS story
WHERE story.story_id = assignment.story_id;

ALTER TABLE storyrail.story_assignments
  ALTER COLUMN site_id SET NOT NULL,
  DROP CONSTRAINT story_assignments_writer_profile_fk,
  ADD CONSTRAINT story_assignments_writer_profile_site_fk
    FOREIGN KEY (writer_profile_id, writer_role, site_id)
    REFERENCES storyrail.agent_profiles (profile_id, role, site_id),
  ADD CONSTRAINT story_assignments_story_site_fk
    FOREIGN KEY (story_id, site_id) REFERENCES storyrail.stories (story_id, site_id);

CREATE INDEX story_assignments_site_id_idx ON storyrail.story_assignments (site_id);

COMMIT;
