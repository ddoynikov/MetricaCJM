-- CJM schema: normalized hits, transitions, page metrics
-- Refresh: DROP dependent tables first, then recreate from raw_metrika.hits

CREATE SCHEMA IF NOT EXISTS app_metrica_cjm;

DROP TABLE IF EXISTS app_metrica_cjm.page_metrics;
DROP TABLE IF EXISTS app_metrica_cjm.transitions;
DROP TABLE IF EXISTS app_metrica_cjm.hits_normalized;

CREATE TABLE app_metrica_cjm.hits_normalized AS
SELECT
  counter_id,
  visit_id,
  date_time,
  device_category,
  utm_source,
  utm_medium,
  utm_campaign,
  goals_id,
  domain,
  CASE
    WHEN regexp_replace(page_raw, '#.*$', '') IN ('', '/') THEN '/'
    ELSE rtrim(regexp_replace(page_raw, '#.*$', ''), '/')
  END AS page
FROM (
  SELECT
    h.counter_id,
    h.visit_id,
    h.date_time,
    h.device_category,
    h.utm_source,
    h.utm_medium,
    h.utm_campaign,
    h.goals_id,
    CASE
      WHEN url LIKE '%warpoint-kemerovo.ru%' THEN 'kemerovo.warpoint.ru'
      ELSE regexp_replace(url, '^(https?://[^/]+).*', '\1')
    END AS domain,
    CASE
      WHEN regexp_replace(url, '\?.*$', '') ~ '^https?://[^/]+/$' THEN '/'
      WHEN url ~ '#[a-zA-Z]'
        AND regexp_replace(regexp_replace(url, '\?.*$', ''), '^https?://[^/]+/?', '') ~ '^#'
        THEN '/'
      WHEN url LIKE '%/tilda/product/detail/%' THEN '/tilda/product/*'
      WHEN url LIKE '%/tilda/form%step%'
        THEN '/form_' || regexp_replace(url, '.*(step\d+).*', '\1')
      WHEN url LIKE '%/tilda/popup%' THEN '/form_popup'
      WHEN url LIKE '%/tilda/form%submitted%' THEN '/form_submitted'
      ELSE regexp_replace(
        regexp_replace(url, '\?.*$', ''),
        '^https?://[^/]+', ''
      )
    END AS page_raw
  FROM raw_metrika.hits h
  WHERE h.is_page_view = 1
    AND url LIKE '%warpoint%'
    AND url NOT LIKE '%yandexwebcache%'
) normalized;

CREATE INDEX idx_hits_normalized_visit_dt
  ON app_metrica_cjm.hits_normalized(visit_id, date_time);

CREATE INDEX idx_hits_normalized_counter
  ON app_metrica_cjm.hits_normalized(counter_id);

CREATE TABLE app_metrica_cjm.transitions AS
WITH ordered AS (
  SELECT
    visit_id,
    page,
    domain,
    date_time,
    LAG(page) OVER (PARTITION BY visit_id ORDER BY date_time) AS prev_page
  FROM app_metrica_cjm.hits_normalized
)
SELECT
  prev_page AS from_page,
  page AS to_page,
  COUNT(*) AS transitions_count,
  COUNT(DISTINCT visit_id) AS unique_visits
FROM ordered
WHERE prev_page IS NOT NULL
  AND prev_page != page
GROUP BY from_page, to_page;

CREATE TABLE app_metrica_cjm.page_metrics AS
WITH entries AS (
  SELECT page, COUNT(*) AS entry_count
  FROM (
    SELECT DISTINCT ON (visit_id) visit_id, page
    FROM app_metrica_cjm.hits_normalized
    ORDER BY visit_id, date_time ASC
  ) t
  GROUP BY page
),
exits AS (
  SELECT page, COUNT(*) AS exit_count
  FROM (
    SELECT DISTINCT ON (visit_id) visit_id, page
    FROM app_metrica_cjm.hits_normalized
    ORDER BY visit_id, date_time DESC
  ) t
  GROUP BY page
),
totals AS (
  SELECT
    page,
    COUNT(*) AS total_hits,
    COUNT(DISTINCT visit_id) AS unique_visits
  FROM app_metrica_cjm.hits_normalized
  GROUP BY page
)
SELECT
  t.page,
  t.total_hits,
  t.unique_visits,
  COALESCE(e.entry_count, 0) AS entries,
  COALESCE(x.exit_count, 0) AS exits,
  ROUND(COALESCE(x.exit_count, 0)::numeric / NULLIF(t.unique_visits, 0) * 100, 1) AS exit_rate
FROM totals t
LEFT JOIN entries e ON t.page = e.page
LEFT JOIN exits x ON t.page = x.page
ORDER BY t.unique_visits DESC;
