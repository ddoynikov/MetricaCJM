# Changelog

## 2026-06-27 — Загрузка данных: UX polish

- Кнопка «Посмотреть данные в БД» — toggle секции `#dataTableSection` через `display`
- Flatpickr (ru) вместо нативного datepicker; быстрые периоды обновляют инстансы
- Авторизация: статус и «Сменить токен» в sidebar; форма OAuth — модальный overlay

## 2026-06-27 — Загрузка данных: UX и table-preview

- `/` — порядок секций: состояние БД → параметры выгрузки → прогресс → данные в базе (внизу)
- Секция «Данные в базе» скрыта по умолчанию; кнопка «Посмотреть данные в БД» / «Скрыть данные»
- `/api/table-preview` — в ответе только колонки, где на текущей странице есть непустые значения
- Таблица данных: табы Визиты/Хиты, фильтр по счётчику, 25 строк на страницу, ellipsis, заголовки без префиксов `ym:s:`/`ym:pv:`, tooltip через `title`

## 2025-06-25 — CJM UI: читаемость графа

- Canvas на всю высоту окна (`calc(100vh - 280px)`)
- Zoom/pan + кнопки «+», «−», «⊙» (fit)
- Подписи узлов через `width/height: label` + padding; tooltip при hover; highlight соседей при клике
- Layout dagre: `nodeSep: 80`, `rankSep: 120`

## 2025-06-25 — CJM API: фильтрация узлов по рёбрам

- `/api/cjm`: nodes содержат только страницы, участвующие хотя бы в одном ребре после `min_transitions` (не все из `page_metrics`)

## 2025-06-25 — CJM: якоря в путях, порог 200

- `sql/004_cjm_schema.sql`: удаление якорей из путей (`/games#price` → `/games`) через `regexp_replace(..., '#.*$', '')` + `rtrim`
- UI CJM: дефолтный `min_transitions` 200 (было 100)

## 2025-06-25 — CJM: нормализация URL и порог графа

- `sql/004_cjm_schema.sql`: trailing slash (`/birthday/` → `/birthday`), якоря на корень (`/#price` → `/`), товары Tilda (`/tilda/product/detail/*` → `/tilda/product/*`); финальный `rtrim` без изменения `/`
- UI CJM: дефолтный `min_transitions` 100 (было 10)

## 2025-06-25 — CJM: загрузка Cytoscape.js

- `static/cjm.html`: CDN cytoscape/dagre переведены на cdnjs; скрипты библиотек перенесены в конец `<body>` перед `cjm.js` (исправлен `cytoscape is not defined`)

## 2025-06-25 — Роут `/cjm`

- Явные роуты `@app.get("/cjm")` и `@app.get("/")` в `app.py` — отдают `static/cjm.html` и `static/index.html` через `FileResponse`
- Страница `http://localhost:8000/cjm` открывается (исправлен 404)

## 2025-06-25 — Dev tooling, известная проблема CJM UI

- `itsdangerous` в `requirements.txt` — зависимость `SessionMiddleware`
- `start.sh`: автоматическая установка зависимостей (`pip3 install -r requirements.txt`) перед запуском
- Скрипт `./go` — остановка uvicorn на порту 8000 и перезапуск `./start.sh`; функция `go` в `~/.zshrc`
- ~~**Известная проблема:** страница `http://localhost:8000/cjm` не работает (UI CJM недоступен)~~ — исправлено в следующей итерации

## 2025-06-25 — Серверная сессия и UX

- OAuth-токен в серверной сессии (`SessionMiddleware`, `SECRET_KEY` в `.env`)
- API `/api/auth`, `/api/auth/status`, `/api/auth/logout`; `METRIKA_TOKEN` автоматически в сессии
- Главная: компактная авторизация, счётчик/даты disabled до входа
- CJM: статус подключения, выбор счётчика (localStorage), фильтр `counter_id`
- `start.sh`: автоприменение `sql/004_cjm_schema.sql` при старте
- `hits_normalized`: добавлен `counter_id`

## 2025-06-25 — Сохранение OAuth-токена

- Переменная `METRIKA_TOKEN` в `.env` / `.env.example`
- API `/api/session` — признак наличия токена в env
- `/api/counters` и `/api/export` используют `METRIKA_TOKEN`, если токен не передан клиентом
- UI: автоподключение при старте, кнопка «Сменить токен»

## 2025-06-25 — Модуль CJM

- DDL `sql/004_cjm_schema.sql`: схема `app_metrica_cjm`, таблицы `hits_normalized`, `transitions`, `page_metrics`
- Нормализация URL (домен, путь, Tilda-формы) в SQL из `raw_metrika.hits`
- API `/api/cjm` — JSON nodes/edges с фильтрами `min_transitions`, `device`, `utm_medium`
- API `/api/cjm/refresh` — пересчёт таблиц (DROP + CREATE)
- API `/api/cjm/channels` — список utm_medium для фильтра
- UI `/cjm` — Cytoscape.js + dagre layout, цвет узлов по exit_rate, размер/толщина по метрикам, боковая панель

## 2025-06-25 — Первая итерация

- FastAPI backend с эндпоинтами `/api/counters`, `/api/export`, `/api/status/{job_id}`, `/api/preview`
- Фоновая выгрузка Logs API (visits + hits): создание задачи, поллинг, скачивание parts, UPSERT в PostgreSQL, clean
- DDL `sql/001_init.sql` для `raw_metrika.visits` и `raw_metrika.hits` (все поля из ТЗ)
- Vanilla JS UI: подключение по токену, выбор счётчика, диапазон дат, прогресс, превью 10 строк
