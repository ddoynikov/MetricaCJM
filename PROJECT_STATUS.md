# Project Status
> Этот файл перезаписывает Cursor после каждой итерации.
> Отдавай этот файл Claude как контекст текущего состояния проекта.

## Что делает проект
Загружает сырые данные визитов и событий из Logs API Яндекс.Метрики в PostgreSQL через веб-интерфейс.

## Текущее состояние
- Статус: в разработке
- Последняя итерация: 2025-06-25
- Что работает:
  - Подключение по OAuth-токену и список счётчиков
  - Автовалидация полей, параллельная выгрузка visits + hits
  - hits — 1 чанк; visits — 2 чанка
  - Адаптивный поллинг Logs API (5 сек / 10 сек)
  - UInt64 → `NUMERIC(20,0)` с явной передачей через `str()` в INSERT (watch_ids, watch_id, visit_id, counter_user_id_hash)
  - UPSERT, превью, `./start.sh`
- Что не работает / в процессе:
  - Применить `sql/003_fix_uint64_hash.sql` на существующей БД

## Структура проекта
```
MetricaCJM/
├── app.py
├── fields.py
├── start.sh
├── static/
├── sql/
│   ├── 001_init.sql
│   ├── 002_fix_uint64.sql
│   └── 003_fix_uint64_hash.sql
├── .env.example
├── requirements.txt
├── README.md
├── CHANGELOG.md
└── PROJECT_STATUS.md
```

## Схема БД
- Схема: `raw_metrika`
- Таблицы: `visits`, `hits`
- UInt64-поля: `watch_ids`, `watch_id`, `visit_id`, `counter_user_id_hash` → `NUMERIC(20,0)` / `NUMERIC(20,0)[]`
- `visits.visit_id` остаётся `BIGINT` (Int64 по документации)

## Архитектурные решения принятые в проекте
- psycopg3 передаёт Python `int` как BIGINT — для NUMERIC-полей UInt64 значения конвертируются в `str` перед INSERT
- Миграции: `002` (watch_ids/watch_id/visit_id), `003` (counter_user_id_hash)

## Следующий шаг
```bash
docker exec -i postgres psql -U analytics -d analytics < sql/003_fix_uint64_hash.sql
```
