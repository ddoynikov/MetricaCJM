# MetricaCJM

Персональная платформа маркетинговой аналитики. Загружает сырые данные из Яндекс Метрики, строит Customer Journey Map и анализирует воронку по каналам.

## Что умеет

- **Загрузка данных** — Logs API Яндекс Метрики → PostgreSQL (визиты + хиты)
- **CJM-граф** — пути пользователей по нормализованным URL, три layout (fCoSE / Cola / Dagre)
- **Просмотр БД** — структура таблиц, поиск по ClientID, переход в CJM по клику
- **Воронка** *(в разработке)* — каналы → расход → клики → визиты → конверсии
- **Профиль клиента** *(планируется)* — история визитов конкретного пользователя

## Стек

- Backend: Python + FastAPI
- Frontend: Vanilla JS + Cytoscape.js
- БД: PostgreSQL 16 (Docker)
- Данные: Яндекс Метрика Logs API

## Запуск

```bash
# 1. Запустить PostgreSQL
cd ../../Shared/docker/postgres && docker compose up -d

# 2. Применить миграции (один раз)
./go migrate

# 3. Запустить сервер
./go
```

Открыть: http://localhost:8000

## Команды

```bash
./go              # перезапустить сервер
./go save         # сохранить в git
./go save "текст" # сохранить с комментарием
./go migrate      # применить миграции БД
```

## Структура БД

- `raw_metrika.visits` — сырые визиты из Метрики
- `raw_metrika.hits` — сырые хиты из Метрики
- `app_metrica_cjm.hits_normalized` — нормализованные URL
- `app_metrica_cjm.transitions` — переходы между страницами
- `app_metrica_cjm.page_metrics` — метрики страниц
