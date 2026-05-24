#!/usr/bin/env bash
# grantflow-log-time — Logowanie czasu do grant-flow
#
# Zależności: bash, curl, python3 lub jq — zero dodatkowych bibliotek
# Konfiguracja: ~/.grantflow (credentials), ~/.grantflow-token, ~/.grantflow-refresh, ~/.grantflow-projects
#
# Użycie:
#   grantflow-log-time --setup
#   grantflow-log-time --status
#   grantflow-log-time --list-projects
#   grantflow-log-time --project <uuid> --hours <num> --date <YYYY-MM-DD> [--description "..."]
#   grantflow-log-time --today
#   grantflow-log-time --week
#   grantflow-log-time --project <uuid> --hours <num>   # date = dzisiaj

set -euo pipefail

# --- Pliki konfiguracyjne ---
CONFIG_FILE="$HOME/.grantflow"
TOKEN_FILE="$HOME/.grantflow-token"
REFRESH_FILE="$HOME/.grantflow-refresh"
PROJECTS_FILE="$HOME/.grantflow-projects"
TOKEN_TTL=2999  # sekundy (~50 min) — margin przed wygaśnięciem 1h

# --- Kolory ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# --- JSON helper (python3 lub jq) ---
json_get() {
  local json="$1" key="$2"
  if command -v jq &>/dev/null; then
    echo "$json" | jq -r ".$key // empty" 2>/dev/null
  else
    python3 -c "
import sys, json
try:
  d = json.loads(sys.stdin.read())
  val = d.get('$key', '')
  print('' if val is None else val)
except:
  pass
" <<< "$json"
  fi
}

json_get_nested() {
  local json="$1" path="$2"
  if command -v jq &>/dev/null; then
    echo "$json" | jq -r "$path // empty" 2>/dev/null
  else
    python3 -c "
import sys, json
try:
  d = json.loads(sys.stdin.read())
  parts = '$path'.lstrip('.').split('.')
  for p in parts:
    if isinstance(d, list):
      d = [item.get(p) for item in d if isinstance(item, dict)]
    elif isinstance(d, dict):
      d = d.get(p)
  if isinstance(d, list):
    for item in d: print(item if item is not None else '')
  elif d is not None:
    print(d)
except:
  pass
" <<< "$json"
  fi
}

json_array_len() {
  local json="$1"
  if command -v jq &>/dev/null; then
    echo "$json" | jq 'length' 2>/dev/null || echo 0
  else
    python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(len(d) if isinstance(d,list) else 0)" <<< "$json" 2>/dev/null || echo 0
  fi
}

# Normalizuj float: zamień przecinek na kropkę
normalize_hours() {
  echo "${1/,/.}"
}

# Walidacja UUID
is_uuid() {
  [[ "$1" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]
}

# --- Wczytaj konfigurację ---
load_config() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo -e "${RED}ERROR:${NC} Brak pliku ~/.grantflow. Uruchom: grantflow-log-time --setup" >&2
    exit 1
  fi
  # Wczytaj zmienne bez eksportowania globalnego
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
  GRANTFLOW_URL="${GRANTFLOW_URL:-http://localhost:3000}"
}

# --- Health check ---
check_health() {
  local url="${1:-$GRANTFLOW_URL}"
  local http_code
  http_code=$(curl -sf -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url/api/health" 2>/dev/null) || true
  [[ "$http_code" == "200" ]]
}

# --- Autentykacja ---
do_login() {
  local url="$GRANTFLOW_URL" email="$GRANTFLOW_EMAIL" password="$GRANTFLOW_PASSWORD"
  local response http_code

  response=$(curl -sf -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
    --connect-timeout 10 \
    "$url/api/auth/login" 2>/dev/null) || {
    echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada pod $url" >&2
    exit 1
  }

  http_code=$(echo "$response" | tail -1)
  local body; body=$(echo "$response" | head -n -1)

  if [[ "$http_code" != "200" && "$http_code" != "201" ]]; then
    echo -e "${RED}ERROR:${NC} Login nieudany (HTTP $http_code). Sprawdź credentials w ~/.grantflow" >&2
    exit 1
  fi

  local access refresh
  # API wraps response: { status, data: { accessToken, refreshToken } }
  access=$(json_get_nested "$body" ".data.accessToken")
  [[ -z "$access" ]] && access=$(json_get "$body" "accessToken")
  refresh=$(json_get_nested "$body" ".data.refreshToken")
  [[ -z "$refresh" ]] && refresh=$(json_get "$body" "refreshToken")

  if [[ -z "$access" ]]; then
    echo -e "${RED}ERROR:${NC} Brak accessToken w odpowiedzi logowania" >&2
    exit 1
  fi

  echo "$access" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  echo "$refresh" > "$REFRESH_FILE"
  chmod 600 "$REFRESH_FILE"
}

do_refresh() {
  if [[ ! -f "$REFRESH_FILE" ]]; then
    do_login
    return
  fi

  local refresh_token; refresh_token=$(cat "$REFRESH_FILE")
  local response http_code

  response=$(curl -sf -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$refresh_token\"}" \
    --connect-timeout 10 \
    "$GRANTFLOW_URL/api/auth/refresh" 2>/dev/null) || {
    do_login
    return
  }

  http_code=$(echo "$response" | tail -1)
  local body; body=$(echo "$response" | head -n -1)

  if [[ "$http_code" != "200" && "$http_code" != "201" ]]; then
    # Refresh token wygasł — zaloguj ponownie
    do_login
    return
  fi

  local access refresh
  access=$(json_get_nested "$body" ".data.accessToken")
  [[ -z "$access" ]] && access=$(json_get "$body" "accessToken")
  refresh=$(json_get_nested "$body" ".data.refreshToken")
  [[ -z "$refresh" ]] && refresh=$(json_get "$body" "refreshToken")

  [[ -n "$access" ]] || { do_login; return; }

  echo "$access" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  [[ -n "$refresh" ]] && { echo "$refresh" > "$REFRESH_FILE"; chmod 600 "$REFRESH_FILE"; }
}

get_token() {
  # Sprawdź czy token istnieje i jest świeży
  if [[ -f "$TOKEN_FILE" ]]; then
    local mod_time now age
    mod_time=$(stat -c %Y "$TOKEN_FILE" 2>/dev/null || stat -f %m "$TOKEN_FILE" 2>/dev/null || echo 0)
    now=$(date +%s)
    age=$((now - mod_time))
    if [[ $age -lt $TOKEN_TTL ]]; then
      cat "$TOKEN_FILE"
      return
    fi
    # Token stary — odśwież
    do_refresh
  else
    do_login
  fi
  cat "$TOKEN_FILE"
}

# --- HTTP call z autentykacją ---
api_call() {
  local method="$1" path="$2" body="${3:-}"
  local token; token=$(get_token)
  local response http_code

  if [[ -n "$body" ]]; then
    response=$(curl -sf -w "\n%{http_code}" -X "$method" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$body" \
      --connect-timeout 10 \
      "$GRANTFLOW_URL$path" 2>/dev/null) || {
      echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada pod $GRANTFLOW_URL" >&2
      exit 1
    }
  else
    response=$(curl -sf -w "\n%{http_code}" -X "$method" \
      -H "Authorization: Bearer $token" \
      --connect-timeout 10 \
      "$GRANTFLOW_URL$path" 2>/dev/null) || {
      echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada pod $GRANTFLOW_URL" >&2
      exit 1
    }
  fi

  http_code=$(echo "$response" | tail -1)
  local resp_body; resp_body=$(echo "$response" | head -n -1)

  # Retry po 401
  if [[ "$http_code" == "401" ]]; then
    do_login
    token=$(get_token)
    if [[ -n "$body" ]]; then
      response=$(curl -sf -w "\n%{http_code}" -X "$method" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$body" \
        --connect-timeout 10 \
        "$GRANTFLOW_URL$path" 2>/dev/null) || { echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada" >&2; exit 1; }
    else
      response=$(curl -sf -w "\n%{http_code}" -X "$method" \
        -H "Authorization: Bearer $token" \
        --connect-timeout 10 \
        "$GRANTFLOW_URL$path" 2>/dev/null) || { echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada" >&2; exit 1; }
    fi
    http_code=$(echo "$response" | tail -1)
    resp_body=$(echo "$response" | head -n -1)
  fi

  if [[ "$http_code" == "403" ]]; then
    echo -e "${RED}ERROR:${NC} Brak uprawnień (HTTP 403). Sprawdź rolę w grant-flow" >&2
    exit 1
  fi

  if [[ "$http_code" == "404" ]]; then
    local msg; msg=$(json_get "$resp_body" "message")
    echo -e "${RED}ERROR:${NC} Nie znaleziono (HTTP 404): ${msg:-$path}" >&2
    exit 1
  fi

  if [[ "$http_code" == "400" ]]; then
    local msg; msg=$(json_get "$resp_body" "message")
    echo -e "${RED}ERROR:${NC} Błąd walidacji: ${msg:-$resp_body}" >&2
    exit 1
  fi

  if [[ "$http_code" != "200" && "$http_code" != "201" ]]; then
    echo -e "${RED}ERROR:${NC} API error HTTP $http_code: $resp_body" >&2
    exit 1
  fi

  echo "$resp_body"
}

# --- Operacje ---

cmd_list_projects() {
  local json_flag="${1:-}"
  local data; data=$(api_call GET "/api/projects?limit=100")
  if [[ "$json_flag" == "--json" ]]; then
    echo "$data"
    return
  fi

  echo -e "${BLUE}Aktywne projekty w grant-flow:${NC}"
  python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
items = d.get('items', d) if isinstance(d, dict) else d
for p in (items if isinstance(items, list) else []):
    status = p.get('status','')
    name = p.get('name','')
    pid = p.get('id','')
    print(f'  {pid}  {name}  [{status}]')
" <<< "$data"
}

cmd_today() {
  local today; today=$(date +%Y-%m-%d)
  local data; data=$(api_call GET "/api/time-entries?fromDate=$today&toDate=$today&limit=50")
  echo -e "${BLUE}Wpisy z dzisiaj ($today):${NC}"
  python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
items = d.get('items', []) if isinstance(d, dict) else d
total = 0.0
for e in items:
    h = float(e.get('hours', 0))
    total += h
    desc = (e.get('description','') or '')[:60]
    print(f'  {h:4.1f}h  {desc}')
print(f'  ------')
print(f'  {total:4.1f}h  RAZEM')
" <<< "$data"
}

cmd_week() {
  local today; today=$(date +%Y-%m-%d)
  # Poniedziałek bieżącego tygodnia
  local monday; monday=$(python3 -c "
from datetime import date, timedelta
d = date.today()
print((d - timedelta(days=d.weekday())).isoformat())
")
  local data; data=$(api_call GET "/api/time-entries?fromDate=$monday&toDate=$today&limit=200")
  echo -e "${BLUE}Wpisy bieżącego tygodnia ($monday – $today):${NC}"
  python3 -c "
import sys, json
from collections import defaultdict
d = json.loads(sys.stdin.read())
items = d.get('items', []) if isinstance(d, dict) else d
by_date = defaultdict(float)
total = 0.0
for e in items:
    h = float(e.get('hours', 0))
    by_date[e.get('entryDate', '?')] += h
    total += h
for dt in sorted(by_date):
    print(f'  {dt}:  {by_date[dt]:.1f}h')
print(f'  ------')
print(f'  RAZEM:   {total:.1f}h')
" <<< "$data"
}

cmd_log_entry() {
  local project_id="$1" hours="$2" entry_date="$3" description="$4" external_reference="$5"

  # Walidacje
  if ! is_uuid "$project_id"; then
    echo -e "${RED}ERROR:${NC} Nieprawidłowy UUID projektu: $project_id" >&2
    exit 1
  fi

  hours=$(normalize_hours "$hours")
  if ! python3 -c "h=float('$hours'); assert 0 < h <= 24" 2>/dev/null; then
    echo -e "${RED}ERROR:${NC} Godziny muszą być między 0 a 24 (podano: $hours)" >&2
    exit 1
  fi

  if [[ -z "$entry_date" ]]; then
    entry_date=$(date +%Y-%m-%d)
  fi

  # Escape description i reference dla JSON
  local desc_json; desc_json=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$description")

  local body="{\"projectId\":\"$project_id\",\"hours\":$hours,\"entryDate\":\"$entry_date\",\"description\":$desc_json}"

  if [[ -n "$external_reference" ]]; then
    local ref_json; ref_json=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$external_reference")
    body="{\"projectId\":\"$project_id\",\"hours\":$hours,\"entryDate\":\"$entry_date\",\"description\":$desc_json,\"externalReference\":$ref_json}"
  fi

  local result; result=$(api_call POST "/api/time-entries" "$body")

  local entry_id; entry_id=$(json_get "$result" "id")
  local short_desc="${description:0:60}"
  echo -e "${GREEN}✓ Zalogowano${NC} ${hours}h — ${short_desc}"
  [[ -n "$external_reference" ]] && echo -e "  Ref: $external_reference"
  [[ -n "$entry_id" ]] && echo -e "  ID: $entry_id"
}

cmd_status() {
  echo -e "${BLUE}Status grant-flow:${NC}"
  load_config
  echo -e "  URL: $GRANTFLOW_URL"
  echo -e "  Email: ${GRANTFLOW_EMAIL:-nie skonfigurowany}"

  if check_health; then
    echo -e "  API: ${GREEN}✓ działa${NC}"
  else
    echo -e "  API: ${RED}✗ nie odpowiada${NC}"
    return
  fi

  if [[ -f "$TOKEN_FILE" ]]; then
    local mod_time now age
    mod_time=$(stat -c %Y "$TOKEN_FILE" 2>/dev/null || stat -f %m "$TOKEN_FILE" 2>/dev/null || echo 0)
    now=$(date +%s)
    age=$((now - mod_time))
    if [[ $age -lt $TOKEN_TTL ]]; then
      echo -e "  Token: ${GREEN}✓ ważny${NC} (${age}s temu odświeżony)"
    else
      echo -e "  Token: ${YELLOW}⚠ wymaga odświeżenia${NC} (${age}s)"
    fi
  else
    echo -e "  Token: ${YELLOW}⚠ brak (pierwsze logowanie przy następnym użyciu)${NC}"
  fi

  if [[ -f "$PROJECTS_FILE" ]]; then
    local count; count=$(python3 -c "import json; d=json.load(open('$PROJECTS_FILE')); print(len(d))")
    echo -e "  Projekty zmapowane: ${GREEN}$count${NC}"
    python3 -c "
import json
d = json.load(open('$PROJECTS_FILE'))
for name, uid in d.items():
    print(f'    {name} → {uid}')
"
  else
    echo -e "  Projekty zmapowane: ${YELLOW}0 (użyj --map <nazwa> <uuid>)${NC}"
  fi
}

cmd_setup() {
  echo -e "${BLUE}=== Konfiguracja grant-flow ===${NC}"
  echo ""

  local url email password

  read -rp "URL grant-flow [http://localhost:3000]: " url
  url="${url:-http://localhost:3000}"

  read -rp "Email: " email
  read -rsp "Hasło: " password
  echo ""

  # Sprawdź health
  echo -n "Sprawdzam połączenie..."
  if ! curl -sf --connect-timeout 5 "$url/api/health" &>/dev/null; then
    echo -e " ${RED}✗${NC}"
    echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada pod $url"
    echo "Uruchom: cd /opt/projects/grant-flow && docker compose up -d"
    exit 1
  fi
  echo -e " ${GREEN}✓${NC}"

  # Zapisz konfigurację
  cat > "$CONFIG_FILE" << EOF
GRANTFLOW_URL=$url
GRANTFLOW_EMAIL=$email
GRANTFLOW_PASSWORD=$password
EOF
  chmod 600 "$CONFIG_FILE"

  # Testuj login
  echo -n "Testuję login..."
  GRANTFLOW_URL="$url"
  GRANTFLOW_EMAIL="$email"
  GRANTFLOW_PASSWORD="$password"
  do_login
  echo -e " ${GREEN}✓${NC}"

  echo ""
  echo -e "${GREEN}Konfiguracja zapisana do ~/.grantflow${NC}"
  echo ""

  # Pokaż projekty i zapytaj o mapowanie
  echo "Dostępne projekty:"
  local projects_json; projects_json=$(api_call GET "/api/projects?limit=100")
  python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
items = d.get('items', d) if isinstance(d, dict) else d
for i, p in enumerate(items if isinstance(items, list) else [], 1):
    print(f'  {i}. {p[\"name\"]}  [{p[\"id\"]}]')
" <<< "$projects_json"

  echo ""
  # Wykryj bieżące repo
  local repo_name=""
  repo_name=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "")
  if [[ -n "$repo_name" ]]; then
    read -rp "Zmapować bieżące repo '$repo_name' na projekt? Wklej UUID (lub Enter aby pominąć): " proj_uuid
    if [[ -n "$proj_uuid" ]] && is_uuid "$proj_uuid"; then
      cmd_map "$repo_name" "$proj_uuid"
    fi
  fi

  echo ""
  echo -e "${GREEN}Setup zakończony.${NC} Użyj 'grantflow-log-time --status' aby sprawdzić konfigurację."
}

cmd_map() {
  local repo_name="$1" project_uuid="$2"
  if ! is_uuid "$project_uuid"; then
    echo -e "${RED}ERROR:${NC} Nieprawidłowy UUID: $project_uuid" >&2
    exit 1
  fi

  local existing="{}"
  [[ -f "$PROJECTS_FILE" ]] && existing=$(cat "$PROJECTS_FILE")

  python3 -c "
import json, sys
d = json.loads(sys.argv[1])
d['$repo_name'] = '$project_uuid'
print(json.dumps(d, indent=2))
" "$existing" > "$PROJECTS_FILE"
  chmod 600 "$PROJECTS_FILE"
  echo -e "${GREEN}✓ Zmapowano${NC} '$repo_name' → $project_uuid"
}

# --- Lookup UUID projektu z ~/.grantflow-projects ---
lookup_project_uuid() {
  local repo_name="$1"
  if [[ -f "$PROJECTS_FILE" ]]; then
    python3 -c "
import json, sys
d = json.load(open('$PROJECTS_FILE'))
print(d.get('$repo_name', ''))
" 2>/dev/null || echo ""
  else
    echo ""
  fi
}

# --- Parser argumentów ---
main() {
  if [[ $# -eq 0 ]]; then
    echo "Użycie:"
    echo "  grantflow-log-time --setup"
    echo "  grantflow-log-time --status"
    echo "  grantflow-log-time --list-projects [--json]"
    echo "  grantflow-log-time --project <uuid> --hours <num> [--date YYYY-MM-DD] [--description \"...\"]"
    echo "                     [--task TS-XXX] [--commit [hash]] [--pr <branch-or-pr>]"
    echo "  grantflow-log-time --today"
    echo "  grantflow-log-time --week"
    echo "  grantflow-log-time --map <repo-name> <project-uuid>"
    echo ""
    echo "Referencje (opcjonalne, można łączyć):"
    echo "  --task TS-RATE-001          ID zadania z backlogu"
    echo "  --commit                    git SHA bieżącego HEAD (auto-detect)"
    echo "  --commit abc1234            konkretny commit hash"
    echo "  --pr feature/billing-rates  nazwa branch lub numer PR"
    exit 0
  fi

  local cmd="" project_id="" hours="" entry_date="" description="" json_flag=""
  local task_ref="" commit_ref="" pr_ref=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --setup)      cmd="setup"; shift ;;
      --status)     cmd="status"; shift ;;
      --list-projects) cmd="list-projects"; shift ;;
      --today)      cmd="today"; shift ;;
      --week)       cmd="week"; shift ;;
      --map)        cmd="map"; shift ;;
      --json)       json_flag="--json"; shift ;;
      --project)    project_id="$2"; shift 2 ;;
      --hours)      hours="$2"; shift 2 ;;
      --date)       entry_date="$2"; shift 2 ;;
      --description) description="$2"; shift 2 ;;
      --task)       task_ref="$2"; shift 2 ;;
      --commit)
        # Jeśli podano wartość po --commit, użyj jej; inaczej auto-detect git HEAD
        if [[ $# -gt 1 && "$2" != --* ]]; then
          commit_ref="$2"; shift 2
        else
          commit_ref=$(git rev-parse --short HEAD 2>/dev/null || echo "")
          shift
        fi
        ;;
      --pr)         pr_ref="$2"; shift 2 ;;
      *)
        echo -e "${RED}ERROR:${NC} Nieznana opcja: $1" >&2
        exit 1
        ;;
    esac
  done

  # Złóż external_reference z dostępnych składników
  local external_reference=""
  if [[ -n "$task_ref" || -n "$commit_ref" || -n "$pr_ref" ]]; then
    local parts=()
    [[ -n "$task_ref" ]] && parts+=("$task_ref")
    [[ -n "$commit_ref" ]] && parts+=("$commit_ref")
    [[ -n "$pr_ref" ]] && parts+=("$pr_ref")
    external_reference=$(IFS=" | "; echo "${parts[*]}")
  fi

  case "$cmd" in
    setup)
      cmd_setup
      ;;
    status)
      cmd_status
      ;;
    list-projects)
      load_config
      if ! check_health; then
        echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada pod $GRANTFLOW_URL" >&2
        exit 1
      fi
      cmd_list_projects "$json_flag"
      ;;
    today)
      load_config
      if ! check_health; then echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada" >&2; exit 1; fi
      cmd_today
      ;;
    week)
      load_config
      if ! check_health; then echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada" >&2; exit 1; fi
      cmd_week
      ;;
    map)
      load_config
      # --map repo-name uuid
      local map_repo="$project_id" map_uuid="$hours"
      # Jeśli wywołano jako --map arg1 arg2 bez --project/--hours
      cmd_map "$map_repo" "$map_uuid"
      ;;
    "")
      if [[ -n "$project_id" && -n "$hours" ]]; then
        load_config
        if ! check_health; then
          echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada pod $GRANTFLOW_URL" >&2
          exit 1
        fi
        cmd_log_entry "$project_id" "$hours" "$entry_date" "$description" "$external_reference"
      else
        echo -e "${RED}ERROR:${NC} Podaj --project i --hours do zalogowania czasu" >&2
        exit 1
      fi
      ;;
    *)
      echo -e "${RED}ERROR:${NC} Nieznana komenda: $cmd" >&2
      exit 1
      ;;
  esac
}

main "$@"
