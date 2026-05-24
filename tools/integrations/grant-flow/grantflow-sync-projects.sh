#!/usr/bin/env bash
# grantflow-sync-projects — Odśwież ~/.grantflow-projects przez interaktywne mapowanie
#
# Użycie:
#   grantflow-sync-projects           # interaktywny: pokaż listę, zapytaj o mapowanie
#   grantflow-sync-projects --json    # wypisz JSON projektów na stdout i zakończ

set -euo pipefail

CONFIG_FILE="$HOME/.grantflow"
PROJECTS_FILE="$HOME/.grantflow-projects"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo -e "${RED}ERROR:${NC} Brak ~/.grantflow. Uruchom: grantflow-log-time --setup" >&2
  exit 1
fi

# Deleguj do głównego narzędzia
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "--json" ]]; then
  bash "$SCRIPT_DIR/grantflow-log-time.sh" --list-projects --json
  exit 0
fi

# Interaktywna sesja mapowania
echo -e "${BLUE}=== Synchronizacja projektów grant-flow ===${NC}"
echo ""

# Pobierz projekty
projects_json=$(bash "$SCRIPT_DIR/grantflow-log-time.sh" --list-projects --json 2>/dev/null) || {
  echo -e "${RED}ERROR:${NC} Nie można pobrać projektów. Sprawdź: grantflow-log-time --status" >&2
  exit 1
}

echo "Dostępne projekty w grant-flow:"
python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
items = d.get('items', d) if isinstance(d, dict) else d
for i, p in enumerate(items if isinstance(items, list) else [], 1):
    print(f'  {i}. {p[\"name\"]}  [{p[\"id\"]}]')
" <<< "$projects_json"

echo ""

# Wczytaj istniejące mapowania
existing="{}"
if [[ -f "$PROJECTS_FILE" ]]; then
  existing=$(cat "$PROJECTS_FILE")
  echo "Aktualne mapowania:"
  python3 -c "
import json
d = json.load(open('$PROJECTS_FILE'))
for name, uid in d.items():
    print(f'  {name} → {uid}')
"
  echo ""
fi

echo "Dodaj mapowanie (nazwa-repo → UUID projektu). Enter aby pominąć."
while true; do
  read -rp "Repo name (lub Enter aby zakończyć): " repo
  [[ -z "$repo" ]] && break
  read -rp "Project UUID dla '$repo': " uuid
  [[ -z "$uuid" ]] && continue

  existing=$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
d['$repo'] = '$uuid'
print(json.dumps(d, indent=2))
" "$existing")

  echo -e "  ${GREEN}✓${NC} Dodano $repo → $uuid"
done

echo "$existing" > "$PROJECTS_FILE"
chmod 600 "$PROJECTS_FILE"

echo ""
echo -e "${GREEN}Zapisano mapowania do ~/.grantflow-projects${NC}"
