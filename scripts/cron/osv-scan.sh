#!/usr/bin/env bash
# Skan zależności z crona (TASK-GSTACK-ADOPT-001, C1): osv-scanner na package-lock.json z korzenia repo
# i z mcp-server/knowledge-retriever. Konfiguracja wyjątków: .osv-scanner.toml — wyjątek bez `ignoreUntil`
# i uzasadnienia to błąd (scripts/osv-ignore-check.mjs), sprawdzany przed każdym skanem.
#
# Brak osv-scanner w PATH NIE jest błędem crona: komunikat i exit 0 (instalacja: https://google.github.io/osv-scanner/).
# Kody wyjścia: 0 = czysto albo brak narzędzia; 1 = znaleziono podatności albo błędna konfiguracja wyjątków;
# inne = błąd osv-scanner (przekazany bez zmian). Niczego nie commituje i nie zmienia lockfile'ów.
#
# Wpis crona (poniedziałek, po raporcie tygodniowym telemetrii 07:45):
#   15 8 * * 1 /opt/projects/claude-patterns/scripts/cron/osv-scan.sh >> /home/dev/.claude/metrics/osv-scan.log 2>&1
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

find_node() {
  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi
  local newest
  newest="$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1)"
  [ -n "$newest" ] && { echo "$newest"; return 0; }
  return 1
}

echo "== osv-scan $(date -u +%Y-%m-%dT%H:%MZ)"

# cron ma ubogi PATH — osv-scanner z ~/go/bin lub ~/.local/bin też bywa poza nim
export PATH="$PATH:$HOME/go/bin:$HOME/.local/bin:/usr/local/bin"
if ! command -v osv-scanner >/dev/null 2>&1; then
  echo "osv-scan: osv-scanner nie jest zainstalowany — pomijam skan (exit 0). Instalacja: https://google.github.io/osv-scanner/installation/" >&2
  exit 0
fi

NODE="$(find_node)" || { echo "osv-scan: nie znaleziono node (PATH ani ~/.nvm/versions/node)" >&2; exit 1; }
cd "$REPO" || exit 1

CONFIG="${OSV_SCAN_CONFIG:-$REPO/.osv-scanner.toml}"   # override tylko dla testów (tests/flow-evals/osv-scan)
# walidacja wyjątków przed skanem: wyjątek bez daty wygaśnięcia = błąd, skan się nie odpala
"$NODE" scripts/osv-ignore-check.mjs "$CONFIG" || { echo "osv-scan: błędna konfiguracja wyjątków — skan przerwany" >&2; exit 1; }

LOCKS=()
for lock in package-lock.json mcp-server/knowledge-retriever/package-lock.json; do
  if [ -f "$REPO/$lock" ]; then LOCKS+=("$REPO/$lock"); else echo "osv-scan: brak $lock — pomijam" >&2; fi
done
[ "${#LOCKS[@]}" -gt 0 ] || { echo "osv-scan: nie znaleziono żadnego package-lock.json" >&2; exit 1; }

ARGS=()
for lock in "${LOCKS[@]}"; do ARGS+=("--lockfile=$lock"); done

# osv-scanner v2 ma podkomendę `scan source`; v1 przyjmuje flagi wprost
if osv-scanner scan source --help >/dev/null 2>&1; then
  osv-scanner scan source --config="$CONFIG" "${ARGS[@]}"
else
  osv-scanner --config="$CONFIG" "${ARGS[@]}"
fi
rc=$?
case "$rc" in
  0) echo "osv-scan: brak znanych podatności w ${#LOCKS[@]} lockfile(ach)" ;;
  1) echo "osv-scan: znaleziono podatności (patrz wyżej) — napraw zależność albo dodaj wyjątek z ignoreUntil i reason do .osv-scanner.toml" >&2 ;;
  *) echo "osv-scan: osv-scanner zakończył się kodem $rc" >&2 ;;
esac
exit "$rc"
