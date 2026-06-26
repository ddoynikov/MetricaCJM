# Яндекс Метрика Logs API Loader

## Что делает
Загружает сырые данные визитов и событий из Logs API Яндекс.Метрики в PostgreSQL (схема `raw_metrika`) через простой веб-интерфейс.

## Как запустить

Первичная настройка (один раз):

```bash
# 1. Убедиться что PostgreSQL запущен
cd ../../Shared/docker/postgres && docker compose up -d

# 2. Создать схему и таблицы
docker exec -i postgres psql -U analytics -d analytics < sql/001_init.sql

# 3. Установить зависимости
pip install -r requirements.txt

# 4. Скопировать .env.example → .env, заполнить DATABASE_URL
cp .env.example .env
```

Запуск приложения — достаточно выполнить из корня проекта:

```bash
./start.sh
```

Или двойной клик по `start.sh` в Finder. Скрипт работает из любой папки (переходит в каталог проекта сам).

Открыть http://localhost:8000

## Команды

```bash
./go              # перезапустить сервер
./go save         # сохранить текущее состояние в git
./go save "текст" # сохранить с комментарием
```

## Схема БД
- Схема: `raw_metrika`
- Таблицы: `visits`, `hits`
- Миграции: `sql/001_init.sql` (генерируется из `fields.py`), `sql/002_fix_uint64.sql` (для уже созданных таблиц)

Если таблицы уже созданы со старыми типами, применить миграцию UInt64:

```bash
docker exec -i postgres psql -U analytics -d analytics < sql/002_fix_uint64.sql
```

## CHANGELOG
См. CHANGELOG.md
