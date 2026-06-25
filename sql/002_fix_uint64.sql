-- Fix UInt64 overflow: watch_id, visit_id (hits), watch_ids (visits)
ALTER TABLE raw_metrika.hits
  ALTER COLUMN watch_id TYPE NUMERIC(20,0),
  ALTER COLUMN visit_id TYPE NUMERIC(20,0);

ALTER TABLE raw_metrika.visits
  ALTER COLUMN watch_ids TYPE NUMERIC(20,0)[]
  USING watch_ids::NUMERIC(20,0)[];
