BEGIN;

CREATE OR REPLACE FUNCTION storyrail.agent_run_story_snapshot_is_valid(value jsonb, expected_story_id text)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['id','title','state','revisionCycle']
    AND value - ARRAY['id','title','state','revisionCycle','purpose'] = '{}'::jsonb
    AND jsonb_typeof(value -> 'id') = 'string' AND value ->> 'id' = expected_story_id
    AND jsonb_typeof(value -> 'title') = 'string' AND btrim(value ->> 'title') <> ''
    AND value ->> 'title' = btrim(value ->> 'title')
    AND jsonb_typeof(value -> 'state') = 'string'
    AND value ->> 'state' IN ('intake','assigned','in_progress','in_review','changes_requested','approved','rejected','published')
    AND jsonb_typeof(value -> 'revisionCycle') = 'number'
    AND (value ->> 'revisionCycle')::integer BETWEEN 0 AND 2
    AND (NOT (value ? 'purpose') OR (
      jsonb_typeof(value -> 'purpose') = 'object'
      AND value -> 'purpose' ?& ARRAY['readerValue','focus']
      AND (value -> 'purpose') - ARRAY['readerValue','focus'] = '{}'::jsonb
      AND jsonb_typeof(value #> '{purpose,readerValue}') = 'string'
      AND btrim(value #>> '{purpose,readerValue}') <> ''
      AND value #>> '{purpose,readerValue}' = btrim(value #>> '{purpose,readerValue}')
      AND length(value #>> '{purpose,readerValue}') <= 2000
      AND jsonb_typeof(value #> '{purpose,focus}') = 'string'
      AND length(value #>> '{purpose,focus}') <= 2000
    ))
$$;

CREATE FUNCTION storyrail.agent_run_editorial_context_is_valid(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['identity','standards']
    AND value - ARRAY['identity','standards'] = '{}'::jsonb
    AND (jsonb_typeof(value -> 'identity') = 'null' OR (
      jsonb_typeof(value -> 'identity') = 'object'
      AND value -> 'identity' ?& ARRAY['name','description']
      AND (value -> 'identity') - ARRAY['name','description'] = '{}'::jsonb
      AND jsonb_typeof(value #> '{identity,name}') = 'string'
      AND length(value #>> '{identity,name}') <= 2000
      AND jsonb_typeof(value #> '{identity,description}') = 'string'
      AND length(value #>> '{identity,description}') <= 8000
    ))
    AND (jsonb_typeof(value -> 'standards') = 'null' OR (
      jsonb_typeof(value -> 'standards') = 'object'
      AND value -> 'standards' ?& ARRAY['id','revisionNumber','text','updatedBy','updatedAt']
      AND (value -> 'standards') - ARRAY['id','revisionNumber','text','updatedBy','updatedAt','brief'] = '{}'::jsonb
      AND jsonb_typeof(value #> '{standards,id}') = 'string'
      AND btrim(value #>> '{standards,id}') <> ''
      AND value #>> '{standards,id}' = btrim(value #>> '{standards,id}')
      AND jsonb_typeof(value #> '{standards,revisionNumber}') = 'number'
      AND (value #>> '{standards,revisionNumber}')::integer >= 1
      AND (value #>> '{standards,revisionNumber}')::numeric = (value #>> '{standards,revisionNumber}')::integer
      AND jsonb_typeof(value #> '{standards,text}') = 'string'
      AND (btrim(value #>> '{standards,text}') <> '' OR (value #> '{standards}') ? 'brief')
      AND length(value #>> '{standards,text}') <= 8000
      AND jsonb_typeof(value #> '{standards,updatedAt}') = 'string'
      AND btrim(value #>> '{standards,updatedAt}') <> ''
      AND jsonb_typeof(value #> '{standards,updatedBy}') = 'object'
      AND value #> '{standards,updatedBy}' ?& ARRAY['type','operatorId']
      AND (value #> '{standards,updatedBy}') - ARRAY['type','operatorId'] = '{}'::jsonb
      AND jsonb_typeof(value #> '{standards,updatedBy,type}') = 'string'
      AND value #>> '{standards,updatedBy,type}' = 'operator'
      AND jsonb_typeof(value #> '{standards,updatedBy,operatorId}') = 'string'
      AND btrim(value #>> '{standards,updatedBy,operatorId}') <> ''
      AND (NOT ((value -> 'standards') ? 'brief') OR (
        jsonb_typeof(value #> '{standards,brief}') = 'object'
        AND value #> '{standards,brief}' ?& ARRAY['audience','readerBenefit','coverageCriteria','voice','avoid']
        AND (value #> '{standards,brief}') - ARRAY['audience','readerBenefit','coverageCriteria','voice','avoid'] = '{}'::jsonb
        AND btrim(value #>> '{standards,brief,audience}') <> ''
        AND btrim(value #>> '{standards,brief,readerBenefit}') <> ''
        AND jsonb_typeof(value #> '{standards,brief,audience}') = 'string'
        AND jsonb_typeof(value #> '{standards,brief,readerBenefit}') = 'string'
        AND jsonb_typeof(value #> '{standards,brief,coverageCriteria}') = 'string'
        AND jsonb_typeof(value #> '{standards,brief,voice}') = 'string'
        AND jsonb_typeof(value #> '{standards,brief,avoid}') = 'string'
        AND length(value #>> '{standards,brief,audience}') <= 2000
        AND length(value #>> '{standards,brief,readerBenefit}') <= 2000
        AND length(value #>> '{standards,brief,coverageCriteria}') <= 2000
        AND length(value #>> '{standards,brief,voice}') <= 2000
        AND length(value #>> '{standards,brief,avoid}') <= 2000
      ))
    ))
$$;

ALTER TABLE storyrail.stories
  ADD CONSTRAINT stories_payload_purpose_check CHECK (
    (NOT (payload ? 'purpose') OR (
      jsonb_typeof(payload -> 'purpose') = 'object'
      AND payload -> 'purpose' ?& ARRAY['readerValue','focus']
      AND (payload -> 'purpose') - ARRAY['readerValue','focus'] = '{}'::jsonb
      AND jsonb_typeof(payload #> '{purpose,readerValue}') = 'string'
      AND btrim(payload #>> '{purpose,readerValue}') <> ''
      AND payload #>> '{purpose,readerValue}' = btrim(payload #>> '{purpose,readerValue}')
      AND length(payload #>> '{purpose,readerValue}') <= 2000
      AND jsonb_typeof(payload #> '{purpose,focus}') = 'string'
      AND length(payload #>> '{purpose,focus}') <= 2000
    ))
    AND ((payload ? 'purposeUpdatedAt') = (payload ? 'purposeUpdatedBy'))
    AND (NOT (payload ? 'purposeUpdatedAt') OR payload ? 'purpose')
    AND (NOT (payload ? 'purposeUpdatedAt') OR (
      jsonb_typeof(payload -> 'purposeUpdatedAt') = 'string'
      AND btrim(payload ->> 'purposeUpdatedAt') <> ''
      AND jsonb_typeof(payload -> 'purposeUpdatedBy') = 'object'
      AND payload -> 'purposeUpdatedBy' ?& ARRAY['type','operatorId']
      AND (payload -> 'purposeUpdatedBy') - ARRAY['type','operatorId'] = '{}'::jsonb
      AND jsonb_typeof(payload #> '{purposeUpdatedBy,type}') = 'string'
      AND payload #>> '{purposeUpdatedBy,type}' = 'operator'
      AND jsonb_typeof(payload #> '{purposeUpdatedBy,operatorId}') = 'string'
      AND btrim(payload #>> '{purposeUpdatedBy,operatorId}') <> ''
    ))
  );

ALTER TABLE storyrail.agent_runs DROP CONSTRAINT agent_runs_payload_input_check;
ALTER TABLE storyrail.agent_runs ADD CONSTRAINT agent_runs_payload_input_check CHECK (
  jsonb_typeof(payload -> 'input') = 'object'
  AND storyrail.agent_run_story_snapshot_is_valid(payload #> '{input,story}', story_id)
  AND storyrail.assignment_run_evidence_is_valid(payload #> '{input,evidence}')
  AND jsonb_array_length(payload #> '{input,evidence}') > 0
  AND storyrail.assignment_run_text_array_is_valid(payload #> '{input,unavailableSourceIds}')
  AND storyrail.assignment_run_source_sets_are_disjoint(payload #> '{input,evidence}', payload #> '{input,unavailableSourceIds}')
  AND (NOT ((payload -> 'input') ? 'editorialContext') OR storyrail.agent_run_editorial_context_is_valid(payload #> '{input,editorialContext}') IS TRUE)
  AND (
    (role = 'assignment_editor'
      AND (payload -> 'input') ?& ARRAY['story','evidence','unavailableSourceIds','writerProfileIds']
      AND (payload -> 'input') - ARRAY['story','evidence','unavailableSourceIds','writerProfileIds','editorialContext'] = '{}'::jsonb
      AND storyrail.assignment_run_text_array_is_valid(payload #> '{input,writerProfileIds}')
      AND jsonb_array_length(payload #> '{input,writerProfileIds}') > 0)
    OR
    (role = 'researcher'
      AND (payload -> 'input') ?& ARRAY['story','evidence','unavailableSourceIds']
      AND (payload -> 'input') - ARRAY['story','evidence','unavailableSourceIds','editorialContext'] = '{}'::jsonb)
    OR
    (role = 'writer' AND operation = 'article_draft'
      AND payload #>> '{input,story,state}' = 'assigned'
      AND (payload -> 'input') ?& ARRAY['story','assignment','evidence','unavailableSourceIds']
      AND (payload -> 'input') - ARRAY['story','assignment','evidence','unavailableSourceIds','editorialContext'] = '{}'::jsonb
      AND storyrail.writer_assignment_snapshot_is_valid(payload #> '{input,assignment}', story_id, profile_id, payload #> '{input,evidence}', payload #> '{input,unavailableSourceIds}'))
    OR
    (role = 'writer' AND operation = 'article_revision'
      AND payload #>> '{input,story,state}' = 'changes_requested'
      AND (payload -> 'input') ?& ARRAY['story','assignment','article','revision','directorReview','reviewDecision','evidence','unavailableSourceIds']
      AND (payload #>> '{input,story,revisionCycle}')::integer BETWEEN 1 AND 2
      AND (payload -> 'input') - ARRAY['story','assignment','article','revision','directorReview','reviewDecision','evidence','unavailableSourceIds','editorialContext'] = '{}'::jsonb
      AND storyrail.writer_assignment_snapshot_is_valid(payload #> '{input,assignment}', story_id, profile_id, payload #> '{input,evidence}', payload #> '{input,unavailableSourceIds}')
      AND storyrail.article_snapshot_is_valid(payload #> '{input,article}', payload #>> '{input,assignment,id}')
      AND storyrail.article_revision_snapshot_is_valid(payload #> '{input,revision}', payload #>> '{input,article,id}', payload #>> '{input,assignment,writerProfileId}')
      AND (payload #>> '{input,revision,revisionNumber}')::integer = (payload #>> '{input,story,revisionCycle}')::integer
      AND storyrail.director_review_is_valid(payload #> '{input,directorReview}')
      AND storyrail.writer_revision_decision_snapshot_is_valid(payload #> '{input,reviewDecision}', story_id, payload #>> '{input,article,id}', payload #>> '{input,revision,id}'))
    OR
    (role = 'editor_in_chief' AND operation = 'article_review'
      AND payload #>> '{input,story,state}' = 'in_review'
      AND (payload -> 'input') ?& ARRAY['story','assignment','article','revision','evidence','unavailableSourceIds']
      AND (payload -> 'input') - ARRAY['story','assignment','article','revision','evidence','unavailableSourceIds','editorialContext'] = '{}'::jsonb
      AND storyrail.writer_assignment_snapshot_is_valid(payload #> '{input,assignment}', story_id, NULL, payload #> '{input,evidence}', payload #> '{input,unavailableSourceIds}')
      AND storyrail.article_snapshot_is_valid(payload #> '{input,article}', payload #>> '{input,assignment,id}')
      AND storyrail.article_revision_snapshot_is_valid(payload #> '{input,revision}', payload #>> '{input,article,id}', payload #>> '{input,assignment,writerProfileId}'))
  )
);

COMMIT;
