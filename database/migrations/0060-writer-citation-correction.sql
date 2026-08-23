BEGIN;

-- The Writer's citations are checked before anything durable is written, and a draft that
-- cited badly was simply refused. That scales poorly: the more evidence a Story rests on, the
-- more citations there are, and the likelier it is that one of them sinks an otherwise good
-- draft. Widening the evidence made drafting less likely to succeed, which is the wrong
-- incentive to give an operator deciding whether to research.
--
-- The Writer now gets exactly one chance to correct citations it got wrong, told precisely
-- which ones. That is not a retry: a retry asks the same question again and hopes for a better
-- answer, while this hands over the findings against it. And a corrected draft is not recorded
-- as a clean one — what was wrong the first time is kept on the run, so the record shows the
-- Writer needed correcting.

CREATE FUNCTION storyrail.grounding_findings_are_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(value) = 'array'
    AND jsonb_array_length(value) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(value) AS found(finding)
      WHERE NOT storyrail.grounding_finding_is_valid(found.finding)
    )
$$;

ALTER TABLE storyrail.agent_runs
  DROP CONSTRAINT agent_runs_payload_exact_shape_check;

ALTER TABLE storyrail.agent_runs
  ADD CONSTRAINT agent_runs_payload_exact_shape_check CHECK (
    payload ?& ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome']
    AND (
      (outcome = 'running'
       AND jsonb_typeof(payload -> 'completedAt') = 'null'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome'] = '{}'::jsonb)
      OR (role = 'assignment_editor' AND outcome = 'succeeded' AND payload ? 'proposal'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','proposal'] = '{}'::jsonb)
      OR (role = 'researcher' AND outcome = 'succeeded' AND payload ? 'attached'
       AND storyrail.researched_sources_are_valid(payload -> 'attached')
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','attached'] = '{}'::jsonb)
      OR (role = 'writer' AND outcome = 'succeeded' AND payload ?& ARRAY['articleId','revisionId']
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','articleId','revisionId','corrected'] = '{}'::jsonb
       AND (
         NOT payload ? 'corrected'
         OR storyrail.grounding_findings_are_valid(payload -> 'corrected')
       ))
      OR (role = 'editor_in_chief' AND outcome = 'succeeded' AND payload ? 'review'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','review'] = '{}'::jsonb)
      OR (outcome = 'failed' AND payload ? 'failure'
       AND payload - ARRAY['id','storyId','profileId','role','operation','model','prompt','requestedBy','startedAt','completedAt','input','outcome','failure'] = '{}'::jsonb)
    )
  );

COMMIT;
