BEGIN;

-- A newsroom delivers to one website, and now says which kind of software is at the other end.
-- One destination rather than a list is deliberate: delivering to several places at once makes
-- partial failure the ordinary case, and nothing here could then say what a half-delivered Story
-- means.
--
-- The kind is stored rather than worked out from which fields are present. An inferred
-- discriminant is a second source of truth, and it disagrees with the first the moment two kinds
-- share a field.
--
-- `package` is StudioCMS's renderer selector and means nothing to WordPress; `username` is half of
-- WordPress's Basic header and means nothing to StudioCMS. Neither is checked for the other kind,
-- so a setting an operator could fill in and watch do nothing is refused here rather than stored.
-- The WordPress Application Password is not here at all: it is a secret and lives in the
-- encrypted store, exactly as the StudioCMS token does.
--
-- 0068's strictness is kept. A destination that is present but half filled in is a delivery that
-- fails at the far end with a page half made somewhere, so the database still refuses it.

-- The old constraint comes off first. 0068 pins a destination to exactly `baseUrl`, `package` and
-- `draft`, so it refuses the backfill below — adding `kind` is adding a fourth key to a shape
-- declared closed. Dropping after the update would fail on any database that has ever configured
-- a destination, which is every database this migration is written for.
ALTER TABLE storyrail.site_settings
  DROP CONSTRAINT IF EXISTS site_settings_destination_shape_check;

-- Every destination stored so far is a StudioCMS one, because it was the only kind that existed.
-- It is backfilled rather than left to be inferred later, so the discriminant is true of every
-- row from the moment the constraint below can rely on it.
UPDATE storyrail.site_settings
  SET payload = jsonb_set(
    payload,
    '{destination,kind}',
    '"studiocms"'::jsonb
  )
  WHERE payload ? 'destination'
    AND jsonb_typeof(payload -> 'destination') = 'object'
    AND NOT payload -> 'destination' ? 'kind';

ALTER TABLE storyrail.site_settings
  ADD CONSTRAINT site_settings_destination_shape_check CHECK (
    NOT payload ? 'destination'
    OR (
      jsonb_typeof(payload -> 'destination') = 'object'
      AND payload -> 'destination' ->> 'kind' IN ('studiocms', 'wordpress')
      AND payload -> 'destination' ?& ARRAY['kind', 'baseUrl', 'draft']
      AND jsonb_typeof(payload -> 'destination' -> 'baseUrl') = 'string'
      AND payload -> 'destination' ->> 'baseUrl' ~ '^https?://[^[:space:]]+$'
      AND payload -> 'destination' ->> 'baseUrl' = btrim(payload -> 'destination' ->> 'baseUrl')
      AND jsonb_typeof(payload -> 'destination' -> 'draft') = 'boolean'
      AND CASE payload -> 'destination' ->> 'kind'
        WHEN 'studiocms' THEN
          payload -> 'destination' ?& ARRAY['package']
          AND (payload -> 'destination') - ARRAY['kind', 'baseUrl', 'package', 'draft'] = '{}'::jsonb
          AND jsonb_typeof(payload -> 'destination' -> 'package') = 'string'
          AND btrim(payload -> 'destination' ->> 'package') <> ''
          AND payload -> 'destination' ->> 'package' = btrim(payload -> 'destination' ->> 'package')
        ELSE
          payload -> 'destination' ?& ARRAY['username']
          AND (payload -> 'destination') - ARRAY['kind', 'baseUrl', 'username', 'draft'] = '{}'::jsonb
          AND jsonb_typeof(payload -> 'destination' -> 'username') = 'string'
          AND btrim(payload -> 'destination' ->> 'username') <> ''
          AND payload -> 'destination' ->> 'username' = btrim(payload -> 'destination' ->> 'username')
      END
    )
  );

COMMIT;
