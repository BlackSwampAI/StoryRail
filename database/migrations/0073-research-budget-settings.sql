BEGIN;

-- How far the Researcher may go was a constant chosen when it had one tool. It has three now, and
-- a search followed by a fetch spends two calls on every outside page, so six calls bought at most
-- two sources and fewer whenever a publisher refused one. The comparison pieces this newsroom
-- exists to write need three or four.
--
-- The right number is not a property of the code: it depends on what a newsroom pays per call and
-- how long its operator is willing to wait. So it moves into the per-Site settings, beside the
-- model choices, which are per-Site for exactly the same reason.
--
-- Calls and turns are stored separately even though they have always held the same number. They
-- measure different things — calls are money, turns are latency — and a single field would force
-- an operator cutting their bill to also make every run slower.
--
-- Nothing is backfilled. A newsroom that has not chosen a budget runs on the defaults the
-- installation ships with, which is every newsroom that exists today.
--
-- 0071 pinned `payload` to exactly `models`, `destination` and `search`, so a fourth key is
-- refused until that constraint is widened. It comes off first for the reason 0069's and 0071's
-- did: a shape declared closed refuses anything written against the wider one.

ALTER TABLE storyrail.site_settings
  DROP CONSTRAINT site_settings_payload_exact_shape_check;

ALTER TABLE storyrail.site_settings
  ADD CONSTRAINT site_settings_payload_exact_shape_check CHECK (
    payload ?& ARRAY['models']
    AND payload - ARRAY['models', 'destination', 'search', 'research'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'models') = 'object'
    AND payload -> 'models' ?& ARRAY[
      'evidencePreparation', 'assignmentEditor', 'writer', 'director', 'researcher'
    ]
    AND (payload -> 'models') - ARRAY[
      'evidencePreparation', 'assignmentEditor', 'writer', 'director', 'researcher'
    ] = '{}'::jsonb
  ),
  -- Both numbers or neither, whole, and bounded at both ends. A fractional budget is compared
  -- against a count that only ever moves by one; a budget of zero is a Researcher that cannot
  -- retrieve the page it would attach, so every run under it can only fail; and a budget without
  -- a ceiling is a bill nobody meant to authorise.
  ADD CONSTRAINT site_settings_research_shape_check CHECK (
    NOT payload ? 'research'
    OR (
      jsonb_typeof(payload -> 'research') = 'object'
      AND payload -> 'research' ?& ARRAY['maximumCalls', 'maximumTurns']
      AND (payload -> 'research') - ARRAY['maximumCalls', 'maximumTurns'] = '{}'::jsonb
      AND jsonb_typeof(payload -> 'research' -> 'maximumCalls') = 'number'
      AND jsonb_typeof(payload -> 'research' -> 'maximumTurns') = 'number'
      AND (payload -> 'research' ->> 'maximumCalls')::numeric
        = trunc((payload -> 'research' ->> 'maximumCalls')::numeric)
      AND (payload -> 'research' ->> 'maximumTurns')::numeric
        = trunc((payload -> 'research' ->> 'maximumTurns')::numeric)
      AND (payload -> 'research' ->> 'maximumCalls')::numeric BETWEEN 1 AND 40
      AND (payload -> 'research' ->> 'maximumTurns')::numeric BETWEEN 1 AND 20
    )
  );

COMMIT;
