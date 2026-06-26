#!/bin/bash
cd "$(dirname "$(dirname "$0")")"
echo "Применяю миграции..."
docker exec -i postgres psql -U analytics -d analytics < sql/001_init.sql
docker exec -i postgres psql -U analytics -d analytics < sql/002_fix_uint64.sql
docker exec -i postgres psql -U analytics -d analytics < sql/003_fix_uint64.sql
docker exec -i postgres psql -U analytics -d analytics < sql/004_cjm_schema.sql
echo "✓ Готово"
