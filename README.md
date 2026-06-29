# MetricaCJM

Персональная платформа маркетинговой аналитики на Logs API Яндекс Метрики. Загружает сырые визиты и хиты в PostgreSQL, строит Customer Journey Map по путям пользователей.

**Статус: MVP** — загрузка данных, просмотр БД и CJM-граф работают на нескольких счётчиках.

## Что умеет (MVP)

| Модуль | Статус | Описание |
|--------|--------|----------|
| **Загрузка данных** | ✓ | Logs API → PostgreSQL (visits + hits), UPSERT, догрузка пропусков |
| **Состояние БД** | ✓ | Таблица по счётчикам, пропуски дат, превью в модальном окне |
| **CJM-граф** | ✓ | Пути по нормализованным URL, фильтры (счётчик, устройство, UTM, ClientID) |
| **Воронка** | скоро | Каналы → расход → клики → визиты → конверсии |
| **Профиль клиента** | планируется | Timeline визитов конкретного пользователя |

### CJM

- Нормализация URL в SQL (Tilda-формы, якоря, trailing slash)
- Layout: fCoSE / Cola / Dagre
- Deep-link: `/cjm?counter_id=…&user_hash=…`
- Пересчёт: вручную или автоматически после выгрузки
- Диагностика: `GET /api/cjm/status` — флаг `cjm_ready` по счётчикам

> На счётчиках с малым трафиком снизьте «Мин. переходов» (дефолт 200) — иначе граф может быть почти пустым.

## Стек

- Backend: Python 3 + FastAPI + psycopg3
- Frontend: Vanilla JS + Cytoscape.js + Flatpickr
- БД: PostgreSQL 16 (Docker)
- Данные: Яндекс Метрика Logs API

## Запуск

```bash
# 1. PostgreSQL
cd ../../Shared/docker/postgres && docker compose up -d

# 2. Переменные окружения
cp .env.example .env
# Заполнить DATABASE_URL, SECRET_KEY, METRIKA_TOKEN (опционально)

# 3. Миграции (один раз)
./go migrate

# 4. Сервер
./go
```

Открыть: http://localhost:8000

## Команды

```bash
./go              # перезапустить сервер
./go migrate      # применить миграции БД
./go save         # git commit (checkpoint)
./go save "текст" # git commit с сообщением
```

## API (основное)

| Endpoint | Назначение |
|----------|------------|
| `GET /api/stats` | Сводка по счётчикам, пропуски дат |
| `POST /api/export` | Запуск выгрузки Logs API |
| `GET /api/table-preview` | Просмотр visits/hits в БД |
| `GET /api/cjm` | Nodes/edges для графа |
| `GET /api/cjm/status` | Готовность CJM по счётчикам |
| `POST /api/cjm/refresh` | Пересчёт CJM (`?counter_id=` опционально) |

## Структура БД

- `raw_metrika.visits` — сырые визиты
- `raw_metrika.hits` — сырые хиты (page views)
- `app_metrica_cjm.hits_normalized` — нормализованные URL
- `app_metrica_cjm.transitions` — переходы между страницами
- `app_metrica_cjm.page_metrics` — метрики страниц (entries, exits, exit_rate)

## Структура проекта

```
MetricaCJM/
├── app.py              # FastAPI: загрузка, CJM, auth
├── fields.py           # Поля Logs API → PostgreSQL
├── static/             # UI (/, /cjm)
├── sql/                # Миграции 001–004
├── PROJECT_STATUS.md   # Контекст для Cursor
└── CHANGELOG.md
```

## Roadmap (после MVP)

1. UserID из CRM (`ym:pv:userID`)
2. Модуль «Воронка»
3. AI-анализ путей и аномалий
