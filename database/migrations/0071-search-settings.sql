BEGIN;

-- A newsroom can be given somewhere to search from, so the Researcher can find a page nobody
-- handed it. Which instance that is, and as whom, is per-Site configuration in exactly the way
-- the destination is, so it lives beside it rather than in the environment.
--
-- The password is not here. SearXNG has no authentication of its own, so what protects an
-- instance sits in front of it, and the secret half of that belongs in the encrypted store under
-- `searxng_password`. The username is half of an HTTP Basic header and is not a secret.
--
-- Nothing is backfilled. A newsroom with no search configured is the ordinary case and every
-- newsroom that has ever run has run that way; the Researcher simply is not offered the tool.
--
-- 0068 pinned `payload` to exactly `models` and `destination`, so a third key is refused until
-- that constraint is widened. It comes off first for the same reason 0069's did: a shape declared
-- closed refuses anything written against the wider one.

ALTER TABLE storyrail.site_settings
  DROP CONSTRAINT site_settings_payload_exact_shape_check;

ALTER TABLE storyrail.site_settings
  ADD CONSTRAINT site_settings_payload_exact_shape_check CHECK (
    payload ?& ARRAY['models']
    AND payload - ARRAY['models', 'destination', 'search'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'models') = 'object'
    AND payload -> 'models' ?& ARRAY[
      'evidencePreparation', 'assignmentEditor', 'writer', 'director', 'researcher'
    ]
    AND (payload -> 'models') - ARRAY[
      'evidencePreparation', 'assignmentEditor', 'writer', 'director', 'researcher'
    ] = '{}'::jsonb
  ),
  -- Search gets the same strictness the destination gets. A base URL with no username is a
  -- request the instance answers 401 to without saying which half was missing, so a half-filled
  -- configuration is refused here rather than stored and discovered mid-run.
  ADD CONSTRAINT site_settings_search_shape_check CHECK (
    NOT payload ? 'search'
    OR (
      jsonb_typeof(payload -> 'search') = 'object'
      AND payload -> 'search' ?& ARRAY['baseUrl', 'username']
      AND (payload -> 'search') - ARRAY['baseUrl', 'username'] = '{}'::jsonb
      AND jsonb_typeof(payload -> 'search' -> 'baseUrl') = 'string'
      AND payload -> 'search' ->> 'baseUrl' ~ '^https?://[^[:space:]]+$'
      AND payload -> 'search' ->> 'baseUrl' = btrim(payload -> 'search' ->> 'baseUrl')
      AND jsonb_typeof(payload -> 'search' -> 'username') = 'string'
      AND btrim(payload -> 'search' ->> 'username') <> ''
      AND payload -> 'search' ->> 'username' = btrim(payload -> 'search' ->> 'username')
    )
  );

COMMIT;
