#!/usr/bin/env bash
# Codzienny audyt floty z crona (TASK-OBS-007, ADR 0011 B1). Zamiast zaszytej ścieżki node z nvm
# (`.../v24.14.1/bin/node` — po zmianie wersji cron pada po cichu) szuka node sam.
#
# Wpis crona:
#   30 7 * * 1-5 /opt/projects/claude-patterns/scripts/cron/audit-daily.sh >> /home/dev/.claude/metrics/audit-daily.log 2>&1
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

find_node() {
  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi
  # cron ma ubogi PATH — bierz najnowszą wersję z nvm
  local newest
  newest="$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1)"
  [ -n "$newest" ] && { echo "$newest"; return 0; }
  return 1
}

NODE="$(find_node)" || { echo "audit-daily: nie znaleziono node (PATH ani ~/.nvm/versions/node)" >&2; exit 1; }
cd "$REPO" && exec "$NODE" scripts/audit-projects.mjs --all --report
