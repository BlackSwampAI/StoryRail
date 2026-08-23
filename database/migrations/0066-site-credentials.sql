BEGIN;

-- Connector credentials belong to a Site, and a process environment does not. One installation
-- running two newsrooms cannot give them different OpenRouter accounts through `.env`, because
-- there is only one `.env` and the second newsroom would quietly spend the first one's money.
--
-- So credentials move into the database, and because a database that can be read is a database
-- that can leak, they move in encrypted. The key stays in the environment: reading the store
-- cannot tell you how to decrypt the store. Only the last four characters of a secret are kept
-- in the clear, so an operator can tell which key is loaded without the system ever being able
-- to show them the key itself. That trade is deliberate and bounded, the way a card ending in
-- four digits is.
--
-- There is no CHECK enumerating which slots exist. Every new connector would otherwise need a
-- migration before it could hold a credential, which is the same reason the tool registry is
-- open. What is constrained is the shape: a slot is lowercase snake_case, a nonce is exactly the
-- twelve bytes AES-GCM expects, and an authentication tag is exactly sixteen. A nonce of the
-- wrong length is not a validation nicety under GCM, it is a silent break of the cipher, and the
-- database is the last place that can refuse it.
--
-- Nothing is backfilled here. The keys live in an environment this migration cannot read, so an
-- installation arrives on the far side of it with no credentials at all and must stay usable
-- until an operator enters them: browsing, intake, and Story creation never needed a key.
--
-- Model selection moves too, but it is configuration rather than a secret and gains nothing from
-- being encrypted, so it lives in a plain payload beside the credentials rather than inside them.

CREATE TABLE storyrail.site_credentials (
  site_id text NOT NULL REFERENCES storyrail.sites (site_id),
  slot text NOT NULL,
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  auth_tag bytea NOT NULL,
  key_version integer NOT NULL,
  hint text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, slot),
  CONSTRAINT site_credentials_slot_format_check CHECK (
    slot <> ''
    AND slot = btrim(slot)
    AND slot ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),
  CONSTRAINT site_credentials_ciphertext_present_check CHECK (octet_length(ciphertext) > 0),
  CONSTRAINT site_credentials_nonce_length_check CHECK (octet_length(nonce) = 12),
  CONSTRAINT site_credentials_auth_tag_length_check CHECK (octet_length(auth_tag) = 16),
  -- Rotation is not built yet. The column exists so that when it is, an installation holding two
  -- generations of key at once needs no schema change to say which row belongs to which.
  CONSTRAINT site_credentials_key_version_check CHECK (key_version >= 1),
  -- Four characters, never more. Without a bound the hint is one careless write away from being
  -- a plaintext copy of the secret sitting next to the ciphertext.
  CONSTRAINT site_credentials_hint_length_check CHECK (char_length(hint) <= 4)
);

CREATE TABLE storyrail.site_settings (
  site_id text PRIMARY KEY REFERENCES storyrail.sites (site_id),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT site_settings_payload_exact_shape_check CHECK (
    payload ?& ARRAY['models']
    AND payload - ARRAY['models'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'models') = 'object'
    AND payload -> 'models' ?& ARRAY[
      'evidencePreparation', 'assignmentEditor', 'writer', 'director', 'researcher'
    ]
    AND (payload -> 'models') - ARRAY[
      'evidencePreparation', 'assignmentEditor', 'writer', 'director', 'researcher'
    ] = '{}'::jsonb
  ),
  -- A model id is a name a provider will accept, so an empty or untrimmed one is not a
  -- preference the operator holds weakly, it is a run that will fail at the provider. CHECK
  -- cannot take a subquery, so each role is named rather than iterated.
  CONSTRAINT site_settings_evidence_preparation_model_check CHECK (
    jsonb_typeof(payload -> 'models' -> 'evidencePreparation') = 'string'
    AND btrim(payload -> 'models' ->> 'evidencePreparation') <> ''
    AND payload -> 'models' ->> 'evidencePreparation' = btrim(payload -> 'models' ->> 'evidencePreparation')
  ),
  CONSTRAINT site_settings_assignment_editor_model_check CHECK (
    jsonb_typeof(payload -> 'models' -> 'assignmentEditor') = 'string'
    AND btrim(payload -> 'models' ->> 'assignmentEditor') <> ''
    AND payload -> 'models' ->> 'assignmentEditor' = btrim(payload -> 'models' ->> 'assignmentEditor')
  ),
  CONSTRAINT site_settings_writer_model_check CHECK (
    jsonb_typeof(payload -> 'models' -> 'writer') = 'string'
    AND btrim(payload -> 'models' ->> 'writer') <> ''
    AND payload -> 'models' ->> 'writer' = btrim(payload -> 'models' ->> 'writer')
  ),
  CONSTRAINT site_settings_director_model_check CHECK (
    jsonb_typeof(payload -> 'models' -> 'director') = 'string'
    AND btrim(payload -> 'models' ->> 'director') <> ''
    AND payload -> 'models' ->> 'director' = btrim(payload -> 'models' ->> 'director')
  ),
  CONSTRAINT site_settings_researcher_model_check CHECK (
    jsonb_typeof(payload -> 'models' -> 'researcher') = 'string'
    AND btrim(payload -> 'models' ->> 'researcher') <> ''
    AND payload -> 'models' ->> 'researcher' = btrim(payload -> 'models' ->> 'researcher')
  )
);

-- Every existing Site keeps working without an operator visiting a settings screen first, so the
-- backfill uses the model the installation was already running on. A migration cannot read the
-- environment, so this is the compiled default rather than whatever `.env` happened to say; an
-- installation that had chosen something else re-selects it once, in the UI.
INSERT INTO storyrail.site_settings (site_id, payload)
SELECT
  site.site_id,
  jsonb_build_object(
    'models',
    jsonb_build_object(
      'evidencePreparation', 'google/gemini-3.7-flash',
      'assignmentEditor', 'google/gemini-3.7-flash',
      'writer', 'google/gemini-3.7-flash',
      'director', 'google/gemini-3.7-flash',
      'researcher', 'google/gemini-3.7-flash'
    )
  )
FROM storyrail.sites AS site;

COMMIT;
