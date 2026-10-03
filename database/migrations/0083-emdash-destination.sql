BEGIN;

-- EmDash replaces StudioCMS as the active destination. Existing StudioCMS settings cannot be
-- converted safely: the API address and renderer model have no mechanical EmDash equivalents.
-- Remove only that destination configuration. Delivery history and all encrypted credentials
-- are intentionally retained so operators can review the old outcomes.
UPDATE storyrail.site_settings
  SET payload = payload - 'destination'
  WHERE payload #>> '{destination,kind}' = 'studiocms';

ALTER TABLE storyrail.site_settings
  DROP CONSTRAINT IF EXISTS site_settings_destination_shape_check;

ALTER TABLE storyrail.site_settings
  ADD CONSTRAINT site_settings_destination_shape_check CHECK (
    NOT payload ? 'destination'
    OR ((
      jsonb_typeof(payload -> 'destination') = 'object'
      AND payload -> 'destination' ->> 'kind' IN ('emdash', 'wordpress')
      AND payload -> 'destination' ?& ARRAY['kind', 'baseUrl', 'draft']
      AND jsonb_typeof(payload -> 'destination' -> 'baseUrl') = 'string'
      AND payload -> 'destination' ->> 'baseUrl' ~ '^https?://[^[:space:]]+$'
      AND payload -> 'destination' ->> 'baseUrl' = btrim(payload -> 'destination' ->> 'baseUrl')
      AND jsonb_typeof(payload -> 'destination' -> 'draft') = 'boolean'
      AND CASE payload -> 'destination' ->> 'kind'
        WHEN 'emdash' THEN
          payload -> 'destination' ?& ARRAY['collection']
          AND (payload -> 'destination') - ARRAY['kind', 'baseUrl', 'collection', 'draft'] = '{}'::jsonb
          AND jsonb_typeof(payload -> 'destination' -> 'collection') = 'string'
          AND length(payload -> 'destination' ->> 'collection') BETWEEN 1 AND 63
          AND payload -> 'destination' ->> 'collection' ~ '^[a-z][a-z0-9_]*$'
          AND payload -> 'destination' ->> 'collection' = btrim(payload -> 'destination' ->> 'collection')
        ELSE
          payload -> 'destination' ?& ARRAY['username']
          AND (payload -> 'destination') - ARRAY['kind', 'baseUrl', 'username', 'draft'] = '{}'::jsonb
          AND jsonb_typeof(payload -> 'destination' -> 'username') = 'string'
          AND btrim(payload -> 'destination' ->> 'username') <> ''
          AND payload -> 'destination' ->> 'username' = btrim(payload -> 'destination' ->> 'username')
      END
    ) IS TRUE)
  );

COMMIT;
