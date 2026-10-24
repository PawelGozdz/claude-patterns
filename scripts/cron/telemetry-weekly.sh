#!/usr/bin/env bash
# Tygodniowy raport telemetrii z crona (TASK-OBS-017, ADR 0015 D6): agregat dzienny, potem raport za ostatni
# zakończony tydzień ISO (`telemetry/reports/<RRRR>-W<ww>.md`) wraz ze zmianą statusu rekordów skrzynki, których
# claim dostał zaufany werdykt. Niczego nie commituje — rollupy, raport i statusy commituje człowiek.
# Node szuka sam (jak audit-daily.sh), bo ścieżka z nvm po zmianie wersji pada pod cronem po cichu.
#
# Wpis crona (poniedziałek, po codziennym audycie 07:30):
#   45 7 * * 1 /opt/projects/claude-patterns/scripts/cron/telemetry-weekly.sh >> /home/dev/.claude/metrics/telemetry-weekly.log 2>&1
# Czy raport powstał pilnuje `node scripts/telemetry-freshness.mjs`.
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

find_node() {
  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi
  local newest
  newest="$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1)"
  [ -n "$newest" ] && { echo "$newest"; return 0; }
  return 1
}

NODE="$(find_node)" || { echo "telemetry-weekly: nie znaleziono node (PATH ani ~/.nvm/versions/node)" >&2; exit 1; }
export PATH="$(dirname "$NODE"):$PATH"
cd "$REPO" || exit 1
echo "== telemetry-weekly $(date -u +%Y-%m-%dT%H:%MZ)"
# agregat dzienny najpierw: raport czyta wyłącznie rollupy; błąd agregatu nie blokuje raportu z tego, co jest
"$NODE" scripts/telemetry-aggregate.mjs --since "$(date -u -d '10 days ago' +%Y-%m-%d)" || echo "telemetry-weekly: agregat zakończył się błędem, raport z istniejących rollupów" >&2
exec "$NODE" scripts/telemetry-report.mjs --weekly
