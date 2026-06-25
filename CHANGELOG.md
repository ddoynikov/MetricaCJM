# Changelog

## 2025-06-25 — Первая итерация

- FastAPI backend с эндпоинтами `/api/counters`, `/api/export`, `/api/status/{job_id}`, `/api/preview`
- Фоновая выгрузка Logs API (visits + hits): создание задачи, поллинг, скачивание parts, UPSERT в PostgreSQL, clean
- DDL `sql/001_init.sql` для `raw_metrika.visits` и `raw_metrika.hits` (все поля из ТЗ)
- Vanilla JS UI: подключение по токену, выбор счётчика, диапазон дат, прогресс, превью 10 строк
