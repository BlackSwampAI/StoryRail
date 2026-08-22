BEGIN;

-- An Article Revision was one opaque Markdown string, so the system could tell a Writer not to
-- invent facts but had no way to check whether it had. A Revision is now an ordered list of
-- blocks, and each block declares what kind of sentence it is: a `claim` asserts something drawn
-- from the evidence and must say where it came from, while `context` is the Writer's own
-- connective prose and must not carry attribution it does not have.
--
-- This migration only makes the structure possible. Writers still produce unattributed prose,
-- which is preserved here as a single `context` block — an honest record of work no one has
-- verified, rather than a claim of grounding that was never earned.

CREATE FUNCTION storyrail.article_citation_is_valid(citation jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(citation) = 'object'
    AND citation ?& ARRAY['sourceId', 'evidenceId', 'quote']
    AND citation - ARRAY['sourceId', 'evidenceId', 'quote'] = '{}'::jsonb
    AND jsonb_typeof(citation -> 'sourceId') = 'string'
    AND btrim(citation ->> 'sourceId') <> ''
    AND jsonb_typeof(citation -> 'evidenceId') = 'string'
    AND btrim(citation ->> 'evidenceId') <> ''
    AND jsonb_typeof(citation -> 'quote') = 'string'
    AND btrim(citation ->> 'quote') <> ''
    AND citation ->> 'quote' = btrim(citation ->> 'quote')
$$;

CREATE FUNCTION storyrail.article_blocks_are_valid(blocks jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(blocks) = 'array'
    AND jsonb_array_length(blocks) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(blocks) AS entry(block)
      WHERE NOT (
        jsonb_typeof(entry.block) = 'object'
        AND entry.block ?& ARRAY['kind', 'markdown', 'citations']
        AND entry.block - ARRAY['kind', 'markdown', 'citations'] = '{}'::jsonb
        AND entry.block ->> 'kind' IN ('heading', 'claim', 'context')
        AND jsonb_typeof(entry.block -> 'markdown') = 'string'
        AND btrim(entry.block ->> 'markdown') <> ''
        AND entry.block ->> 'markdown' = btrim(entry.block ->> 'markdown')
        AND jsonb_typeof(entry.block -> 'citations') = 'array'
        -- A claim without a citation cannot be checked; a citation on prose that claims nothing
        -- implies support the Writer never offered.
        AND CASE
              WHEN entry.block ->> 'kind' = 'claim'
                THEN jsonb_array_length(entry.block -> 'citations') > 0
              ELSE jsonb_array_length(entry.block -> 'citations') = 0
            END
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(entry.block -> 'citations') AS cited(citation)
          WHERE NOT storyrail.article_citation_is_valid(cited.citation)
        )
      )
    )
$$;

ALTER TABLE storyrail.article_revisions
  DROP CONSTRAINT article_revisions_payload_check;

UPDATE storyrail.article_revisions
SET payload = (payload - 'bodyMarkdown')
  || jsonb_build_object(
       'blocks',
       jsonb_build_array(
         jsonb_build_object(
           'kind', 'context',
           'markdown', btrim(payload ->> 'bodyMarkdown'),
           'citations', '[]'::jsonb
         )
       )
     )
WHERE payload ? 'bodyMarkdown';

ALTER TABLE storyrail.article_revisions
  ADD CONSTRAINT article_revisions_payload_check CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['id','articleId','revisionNumber','writerProfileId','agentRunId','headline','dek','blocks','createdBy','createdAt']
    AND payload - ARRAY['id','articleId','revisionNumber','writerProfileId','agentRunId','headline','dek','blocks','createdBy','createdAt'] = '{}'::jsonb
    AND payload ->> 'id' = revision_id AND payload ->> 'articleId' = article_id
    AND (payload ->> 'revisionNumber')::integer = revision_number
    AND payload ->> 'writerProfileId' = writer_profile_id AND payload ->> 'agentRunId' = agent_run_id
    AND jsonb_typeof(payload -> 'headline') = 'string' AND btrim(payload ->> 'headline') <> '' AND payload ->> 'headline' = btrim(payload ->> 'headline')
    AND (jsonb_typeof(payload -> 'dek') = 'null' OR (jsonb_typeof(payload -> 'dek') = 'string' AND btrim(payload ->> 'dek') <> '' AND payload ->> 'dek' = btrim(payload ->> 'dek')))
    AND storyrail.article_blocks_are_valid(payload -> 'blocks')
    AND payload -> 'createdBy' = jsonb_build_object('type','agent','role','writer','runId',agent_run_id)
    AND jsonb_typeof(payload -> 'createdAt') = 'string' AND btrim(payload ->> 'createdAt') <> ''
  );

COMMIT;
