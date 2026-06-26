# Project Status
> Этот файл перезаписывает Cursor после каждой итерации.
> Отдавай этот файл Claude как контекст текущего состояния проекта.

## Что делает проект
Загружает сырые данные визитов и событий из Logs API Яндекс.Метрики в PostgreSQL через веб-интерфейс. Строит Customer Journey Map (CJM) по нормализованным URL.

## Текущее состояние
- Статус: в разработке
- Последняя итерация: 2026-06-27 (Итерация 4 — UX загрузки данных)
- Что работает:
  - Подключение по OAuth-токену и список счётчиков
  - OAuth-флоу: ClientID → authorize URL → вставка токена → POST /api/auth
  - Автовалидация полей, параллельная выгрузка visits + hits
  - hits — 1 чанк; visits — 2 чанка
  - Адаптивный поллинг Logs API (5 сек / 10 сек)
  - UInt64 → `NUMERIC(20,0)` с явной передачей через `str()` в INSERT
  - Миграции БД применены: `002_fix_uint64.sql`, `003_fix_uint64.sql`
  - UPSERT, превью, `./start.sh` (автоприменение `004_cjm_schema.sql` через docker)
  - CJM: схема `app_metrica_cjm`, нормализация URL в SQL, API `/api/cjm*`
  - `/api/stats` — сводка по всем счётчикам с данными в БД (visits/hits, пропуски, last_updated)
  - UI: тёмная тема, shell-лейаут (sidebar + topbar), design tokens, Lucide icons
  - `/` — компактная таблица состояния БД по счётчикам; range-picker Flatpickr; быстрые периоды (включая «Год»)
  - `/cjm` — граф: прямоугольные узлы 13px, border по трафику, ссылка «Открыть страницу ↗»
  - CJM: ползунок «Мин. переходов», поиск по counter_user_id_hash / user_id
  - Серверная сессия OAuth: `SessionMiddleware` + `SECRET_KEY`
  - Dev tooling: `./go`, `start.sh`
  - **Итерация 2:** sidebar — все 5 модулей с описаниями и бейджами (активные/скоро/в разработке/планируется)
  - **Итерация 2:** collapsible «Статус проекта» в sidebar — GET `/api/project-status`, `static/layout.js`
  - **Итерация 2:** GET `/api/table-preview` — постраничный просмотр visits/hits (используется в модальном попапе)
  - **Итерация 2:** CJM — padding узлов `6px 20px`; главная `/` всегда на графе (SQL + post-filter)
  - **Итерация 3:** `/` — порядок секций: состояние БД → параметры → прогресс → результат/превью
  - **Итерация 3:** кнопка «Посмотреть данные в БД» под таблицей состояния (открывает модальный попап)
  - **Итерация 3:** `/api/table-preview` — только колонки с непустыми значениями на странице
  - **Итерация 3:** таблица данных — 25 строк, ellipsis, заголовки без `ym:s:`/`ym:pv:`, `title` на ячейках
  - **Итерация 3:** Flatpickr для выбора дат; быстрые периоды синхронизированы с календарём (заменено range-picker в итерации 4)
  - **Итерация 3:** авторизация только в sidebar + модальное окно (без дублирования в main)
  - **Итерация 3:** CJM — layout fCoSE/Cola/Dagre, улучшенная легенда, transitions из `app_metrica_cjm.transitions`
  - **Итерация 4:** `/` — единый range-picker Flatpickr (2 месяца, mode: range) + быстрые периоды через `setDate`
  - **Итерация 4:** таблица состояния БД — счётчики без данных скрыты за «Показать незагруженные (N)»
  - **Итерация 4:** клик на пропуски — popover со списком пропущенных дат
  - **Итерация 4:** «Посмотреть данные в БД» — модальный попап (табы, фильтр счётчика, пагинация 25 строк)
- Что не работает / в процессе:
  - Страница «Воронка» (`/funnel`) — заглушка «скоро»
  - AI-анализ, Конкуренты — только в навигации (disabled)
  - UserID (CRM): колонка `user_id` в `raw_metrika.hits` отсутствует — фильтр возвращает пустой граф с предупреждением


## Структура проекта
```
MetricaCJM/
├── app.py
├── fields.py
├── start.sh
├── go
├── static/
│   ├── tokens.css
│   ├── layout.css
│   ├── layout.js
│   ├── components.css
│   ├── style.css
│   ├── index.html
│   ├── app.js
│   ├── cjm.html
│   ├── cjm.js
│   └── cjm.css
├── sql/
│   ├── 001_init.sql
│   ├── 002_fix_uint64.sql
│   ├── 003_fix_uint64.sql
│   └── 004_cjm_schema.sql
├── .env.example
├── requirements.txt
├── README.md
├── CHANGELOG.md
└── PROJECT_STATUS.md
```

## Схема БД
- Схема сырых данных: `raw_metrika` — таблицы `visits`, `hits`
- Схема CJM: `app_metrica_cjm` — `hits_normalized` (включая `counter_id`), `transitions`, `page_metrics`
- UInt64-поля: `watch_ids`, `watch_id`, `visit_id`, `counter_user_id_hash` → `NUMERIC(20,0)` / `NUMERIC(20,0)[]`
- `visits.visit_id` остаётся `BIGINT` (Int64 по документации)

## Архитектурные решения принятые в проекте
- psycopg3 передаёт Python `int` как BIGINT — для NUMERIC-полей UInt64 значения конвертируются в `str` перед INSERT
- Нормализация URL для CJM — только в SQL (`004_cjm_schema.sql`), не в Python
- Фильтры CJM (counter_id, device, utm_medium, user_id) применяются динамически к `hits_normalized`; пересчёт таблиц — DROP + CREATE через `/api/cjm/refresh`
- Фильтр по пользователю: `counter_user_id_hash` через подзапрос к `raw_metrika.hits`; `user_id` — только если колонка существует в схеме
- `/api/stats` — группировка по `counter_id` в visits/hits; UI объединяет с OAuth-списком счётчиков
- OAuth-токен хранится в серверной cookie-сессии (`SECRET_KEY`); `METRIKA_TOKEN` из `.env` — fallback при первом запросе
- UI: CSS design tokens (`tokens.css`), общий shell (`layout.css`, `layout.js`), компоненты (`components.css`), страничные стили (`style.css`, `cjm.css`)
- `/api/table-preview` — постраничный просмотр `raw_metrika.visits|hits`, сортировка по `date DESC`, опциональный фильтр `counter_id`; колонки без данных на текущей странице скрываются; UI — модальный попап на `/`
- CJM: переходы с `/` и на `/` не фильтруются порогом `min_transitions`; узел `/` всегда включается в ответ

## Следующий шаг
- Прогон полной выгрузки на реальном счётчике, пересчёт CJM и проверка графа на warpoint-данных
- При необходимости UserID — добавить `ym:pv:userID` в fields.py и миграцию колонки `user_id`
- Страница «Воронка» или AI-анализ (по приоритету)
