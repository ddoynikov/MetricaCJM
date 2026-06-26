#!/bin/bash
# Быстрый коммит текущего состояния
cd "$(dirname "$0")"
MSG=${1:-"checkpoint: $(date '+%Y-%m-%d %H:%M')"}
git add -A
git commit -m "$MSG"
echo "✓ Сохранено: $MSG"
