#!/bin/bash
cd "$(dirname "$0")"

# Auto-commit перед стартом
if git rev-parse --git-dir > /dev/null 2>&1; then
  git add -A
  git commit -m "auto: snapshot before start $(date '+%Y-%m-%d %H:%M')" --allow-empty
  echo "✓ Git snapshot создан"
fi

pip3 install -q -r requirements.txt
docker exec -i postgres psql -U analytics -d analytics < sql/004_cjm_schema.sql 2>/dev/null || true
uvicorn app:app --reload --port 8000
