-- CJM schema: normalized hits, transitions, page metrics
-- Только DDL. Данные — через «Пересчитать CJM» (/api/cjm/refresh).

CREATE SCHEMA IF NOT EXISTS app_metrica_cjm;

CREATE TABLE IF NOT EXISTS app_metrica_cjm.hits_normalized (
  counter_id BIGINT,
  visit_id NUMERIC(20, 0),
  date_time TIMESTAMP,
  device_category TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  goals_id TEXT,
  domain TEXT,
  page TEXT
);

CREATE INDEX IF NOT EXISTS idx_hits_normalized_visit_dt
  ON app_metrica_cjm.hits_normalized(visit_id, date_time);

CREATE INDEX IF NOT EXISTS idx_hits_normalized_counter
  ON app_metrica_cjm.hits_normalized(counter_id);

CREATE TABLE IF NOT EXISTS app_metrica_cjm.transitions (
  counter_id BIGINT NOT NULL,
  from_page TEXT NOT NULL,
  to_page TEXT NOT NULL,
  transitions_count INTEGER NOT NULL,
  unique_visits INTEGER NOT NULL,
  PRIMARY KEY (counter_id, from_page, to_page)
);

CREATE TABLE IF NOT EXISTS app_metrica_cjm.page_metrics (
  counter_id BIGINT NOT NULL,
  page TEXT NOT NULL,
  total_hits INTEGER,
  unique_visits INTEGER,
  entries INTEGER,
  exits INTEGER,
  exit_rate NUMERIC(5, 1),
  PRIMARY KEY (counter_id, page)
);

CREATE INDEX IF NOT EXISTS idx_transitions_counter
  ON app_metrica_cjm.transitions(counter_id);

CREATE INDEX IF NOT EXISTS idx_page_metrics_counter
  ON app_metrica_cjm.page_metrics(counter_id);
