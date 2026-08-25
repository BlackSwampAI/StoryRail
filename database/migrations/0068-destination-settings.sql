BEGIN;

-- Where a newsroom publishes is per-Site configuration in exactly the way its models are, so it
-- lives beside them rather than in the environment: one installation running two newsrooms has
-- one `.env` and two destinations, and the second newsroom would otherwise deliver to the
-- first one's website.
--
-- The API token is not here. It is a secret and belongs in the encrypted store, so what remains
-- is the address, the renderer package, and whether pages arrive as drafts. Only the token can
-- leak, and only the token is encrypted.
--
-- There is no author. The destination attributes every page it creates to whoever owns the token
-- that created it and ignores any author sent with the request, so a setting for one would be a
-- field an operator could fill in and watch do nothing.
--
-- `destination` is optional and nothing is backfilled: an installation arrives here with no
-- destination configured and must keep working, because every newsroom that has ever run has
-- run without one.

ALTER TABLE storyrail.site_settings
  DROP CONSTRAINT site_settings_payload_exact_shape_check;

ALTER TABLE storyrail.site_settings
  ADD CONSTRAINT site_settings_payload_exact_shape_check CHECK (
    payload ?& ARRAY['models']
    AND payload - ARRAY['models', 'destination'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'models') = 'object'
    AND payload -> 'models' ?& ARRAY[
      'evidencePreparation', 'assignmentEditor', 'writer', 'director', 'researcher'
    ]
    AND (payload -> 'models') - ARRAY[
      'evidencePreparation', 'assignmentEditor', 'writer', 'director', 'researcher'
    ] = '{}'::jsonb
  ),
  -- A destination that is present but half filled in is a delivery that fails at the far end
  -- rather than a preference held weakly, so the database refuses it here instead.
  ADD CONSTRAINT site_settings_destination_shape_check CHECK (
    NOT payload ? 'destination'
    OR (
      jsonb_typeof(payload -> 'destination') = 'object'
      AND payload -> 'destination' ?& ARRAY['baseUrl', 'package', 'draft']
      AND (payload -> 'destination') - ARRAY['baseUrl', 'package', 'draft'] = '{}'::jsonb
      AND jsonb_typeof(payload -> 'destination' -> 'baseUrl') = 'string'
      AND payload -> 'destination' ->> 'baseUrl' ~ '^https?://[^[:space:]]+$'
      AND payload -> 'destination' ->> 'baseUrl' = btrim(payload -> 'destination' ->> 'baseUrl')
      AND jsonb_typeof(payload -> 'destination' -> 'package') = 'string'
      AND btrim(payload -> 'destination' ->> 'package') <> ''
      AND payload -> 'destination' ->> 'package' = btrim(payload -> 'destination' ->> 'package')
      AND jsonb_typeof(payload -> 'destination' -> 'draft') = 'boolean'
    )
  );

COMMIT;
