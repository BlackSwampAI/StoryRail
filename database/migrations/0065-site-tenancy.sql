BEGIN;

-- StoryRail assumed there was exactly one newsroom. Every Story, Source, standards revision, and
-- Agent Profile in the installation belonged to whoever was looking, so running a second website
-- meant running a second container with a second database beside it.
--
-- A Site is the tenant boundary. It is not a label on a row that the application agrees to honour:
-- the four editorial roots carry a site and every listing and every lookup filters by it, so a
-- Story identifier from one site pasted into another site's URL comes back as though it were not
-- there. Everything else in the schema descends from exactly one of those four roots and inherits
-- its site through that descent, which is why nothing else gains a column. A second copy of a
-- value is a second thing that can drift.
--
-- One place two roots meet directly is a Story attaching a Source, and that is the one place a
-- cross-site leak is reachable by writing the wrong pair of identifiers. Composite foreign keys
-- make the pair itself the thing the database checks, so an attachment joining a Story on one
-- site to a Source on another is rejected by PostgreSQL rather than merely avoided by the code
-- that would have written it.
--
-- The one Site created here is deliberately a placeholder. Nothing can create a Site yet, so
-- every existing record backfills to it and the installation keeps running exactly as it did.

CREATE TABLE storyrail.sites (
  site_id text PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sites_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT sites_payload_exact_shape_check CHECK (
    payload ?& ARRAY['id', 'name', 'domain', 'description']
    AND payload - ARRAY['id', 'name', 'domain', 'description'] = '{}'::jsonb
  ),
  CONSTRAINT sites_payload_identity_check CHECK (
    jsonb_typeof(payload -> 'id') = 'string'
    AND payload ->> 'id' = site_id
  ),
  CONSTRAINT sites_payload_name_check CHECK (
    jsonb_typeof(payload -> 'name') = 'string'
    AND btrim(payload ->> 'name') <> ''
    AND payload ->> 'name' = btrim(payload ->> 'name')
  ),
  CONSTRAINT sites_payload_domain_check CHECK (
    jsonb_typeof(payload -> 'domain') = 'string'
    AND btrim(payload ->> 'domain') <> ''
    AND payload ->> 'domain' = btrim(payload ->> 'domain')
    AND payload ->> 'domain' = lower(payload ->> 'domain')
  ),
  CONSTRAINT sites_payload_description_check CHECK (
    jsonb_typeof(payload -> 'description') = 'string'
    AND btrim(payload ->> 'description') <> ''
    AND payload ->> 'description' = btrim(payload ->> 'description')
  )
);

INSERT INTO storyrail.sites (site_id, payload)
VALUES (
  'site-default',
  jsonb_build_object(
    'id', 'site-default',
    'name', 'Default Newsroom',
    'domain', 'localhost',
    'description', 'The newsroom this installation started with, before any site was named.'
  )
);

ALTER TABLE storyrail.stories ADD COLUMN site_id text;
ALTER TABLE storyrail.url_sources ADD COLUMN site_id text;
ALTER TABLE storyrail.newsroom_standards ADD COLUMN site_id text;
ALTER TABLE storyrail.agent_profiles ADD COLUMN site_id text;

UPDATE storyrail.stories SET site_id = 'site-default';
UPDATE storyrail.url_sources SET site_id = 'site-default';

-- The append-only trigger on newsroom standards refuses every UPDATE, including this one, so the
-- backfill has to step around a rule that exists to stop editors rewriting history rather than to
-- stop a migration adding a column. The trigger is restored before the transaction commits.
ALTER TABLE storyrail.newsroom_standards DISABLE TRIGGER newsroom_standards_append_only;
UPDATE storyrail.newsroom_standards SET site_id = 'site-default';
ALTER TABLE storyrail.newsroom_standards ENABLE TRIGGER newsroom_standards_append_only;

UPDATE storyrail.agent_profiles SET site_id = 'site-default';

ALTER TABLE storyrail.stories
  ALTER COLUMN site_id SET NOT NULL,
  ADD CONSTRAINT stories_site_fk FOREIGN KEY (site_id) REFERENCES storyrail.sites (site_id);
ALTER TABLE storyrail.url_sources
  ALTER COLUMN site_id SET NOT NULL,
  ADD CONSTRAINT url_sources_site_fk FOREIGN KEY (site_id) REFERENCES storyrail.sites (site_id);
ALTER TABLE storyrail.newsroom_standards
  ALTER COLUMN site_id SET NOT NULL,
  ADD CONSTRAINT newsroom_standards_site_fk
    FOREIGN KEY (site_id) REFERENCES storyrail.sites (site_id);
ALTER TABLE storyrail.agent_profiles
  ALTER COLUMN site_id SET NOT NULL,
  ADD CONSTRAINT agent_profiles_site_fk FOREIGN KEY (site_id) REFERENCES storyrail.sites (site_id);

-- Redundant against the primary keys, and that is the point: a composite foreign key needs a
-- unique index over exactly the pair of columns it references.
ALTER TABLE storyrail.stories
  ADD CONSTRAINT stories_story_site_key UNIQUE (story_id, site_id);
ALTER TABLE storyrail.url_sources
  ADD CONSTRAINT url_sources_source_site_key UNIQUE (source_id, site_id);

-- Revision numbers were unique across the whole installation, which would have let the first site
-- to write revision 1 stop every other site from ever having one. A revision is a position in one
-- newsroom's history, not in the installation's.
ALTER TABLE storyrail.newsroom_standards
  DROP CONSTRAINT newsroom_standards_revision_number_key,
  ADD CONSTRAINT newsroom_standards_site_revision_key UNIQUE (site_id, revision_number);

-- A canonical URL was unique across the whole installation, which meant the first newsroom to
-- ingest a page took it away from every other one. The same reporting is ordinary evidence for
-- two newsrooms at once, and overlapping beats are a reason to run several sites rather than a
-- reason one of them should lose. A URL is claimed within a newsroom, not within the machine.
ALTER TABLE storyrail.url_sources
  DROP CONSTRAINT url_sources_canonical_url_key,
  ADD CONSTRAINT url_sources_site_canonical_url_key UNIQUE (site_id, canonical_url);

ALTER TABLE storyrail.story_source_attachments ADD COLUMN site_id text;

-- An attachment cannot disagree with the Story it hangs from, so its site is read from there
-- rather than supplied.
UPDATE storyrail.story_source_attachments AS attachment
SET site_id = story.site_id
FROM storyrail.stories AS story
WHERE story.story_id = attachment.story_id;

-- The single-column foreign keys already on this table stay. The composite keys below subsume
-- them, and dropping them would trade a redundant guarantee for nothing.
ALTER TABLE storyrail.story_source_attachments
  ALTER COLUMN site_id SET NOT NULL,
  ADD CONSTRAINT story_source_attachments_story_site_fk
    FOREIGN KEY (story_id, site_id) REFERENCES storyrail.stories (story_id, site_id),
  ADD CONSTRAINT story_source_attachments_source_site_fk
    FOREIGN KEY (source_id, site_id) REFERENCES storyrail.url_sources (source_id, site_id);

CREATE INDEX stories_site_id_idx ON storyrail.stories (site_id);
CREATE INDEX url_sources_site_id_idx ON storyrail.url_sources (site_id);
CREATE INDEX agent_profiles_site_id_idx ON storyrail.agent_profiles (site_id);

COMMIT;
