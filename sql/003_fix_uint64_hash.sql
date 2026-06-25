-- Fix UInt64 overflow: counter_user_id_hash (visits, hits)
ALTER TABLE raw_metrika.visits
  ALTER COLUMN counter_user_id_hash TYPE NUMERIC(20,0)
  USING counter_user_id_hash::NUMERIC(20,0);

ALTER TABLE raw_metrika.hits
  ALTER COLUMN counter_user_id_hash TYPE NUMERIC(20,0)
  USING counter_user_id_hash::NUMERIC(20,0);
