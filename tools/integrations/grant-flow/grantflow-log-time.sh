#!/usr/bin/env bash
# grantflow-log-time — Logowanie czasu do grant-flow
#
# Auth: PAT przez iam (TS-SSO-028/033/035 w repo iam), loopback-redirect login
# (RFC 8252, ten sam wzorzec co `gh auth login`/`aws sso login`) przez towarzyszący
# katalog pat-login-cli/ (kopia iam's src/tooling/pat-login-cli — jego własny README
# nazywa się "temporary code" wprost przeznaczonym do kopiowania do konsumentów, nie
# importu cross-repo). Stare logowanie email+hasło (/api/auth/login, /api/auth/refresh)
# zniknęło z grant-flow przy TS-SSO-023 (2026-08-24) — ta wersja skryptu to zastępuje.
#
# Zależności: bash, curl, python3 lub jq, node + npx (tsx via npx) — npx/node tylko do
# logowania przez przeglądarkę (get_token/invalidate_token), reszta zero-dependency.
# Konfiguracja: ~/.grantflow (URL bramy + panelu iam), ~/.grantflow-projects (globalne
# mapowanie repo → projekt), $REPO_ROOT/.grantflow (lokalne per-repo, opcjonalne, patrz
# skills/integrations/log-time — Krok 2a)
# Cache tokenu: ~/.cache/iam-pat-cli/ (zarządzany przez pat-login-cli, nie przez ten skrypt)
#
# Instalacja: patrz README.md w tym katalogu — kopiuje SIEBIE + pat-login-cli/ razem,
# ten skrypt oczekuje pat-login-cli/ jako brata w tym samym katalogu instalacji.
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
PROJECTS_FILE="$HOME/.grantflow-projects"
# Domyślnie ~/.local/share (nie $HOME/.local/bin, gdzie ląduje sam skrypt — bin/ per
# konwencji trzyma tylko wykonywalne pliki, nie towarzyszące katalogi modułów). Nadpisywalne
# przez GRANTFLOW_PAT_CLI_DIR — instalator (setup-project.sh) może umieścić to gdziekolwiek.
PAT_CLI_DIR="${GRANTFLOW_PAT_CLI_DIR:-$HOME/.local/share/grantflow-cli/pat-login-cli}"

# --- Kolory ---
# Nie source'ujemy scripts/lib/common.sh (K41) — ten plik jest deployowany jako
# płaska kopia (patrz README instalacji), bez gwarancji, że lib/ pojedzie razem.
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
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
  GRANTFLOW_URL="${GRANTFLOW_URL:-https://grant-flow.app.dev.juz-ide.pl}"
  if [[ -z "${IAM_ADMIN_BASE_URL:-}" ]]; then
    echo -e "${RED}ERROR:${NC} Brak IAM_ADMIN_BASE_URL w ~/.grantflow. Uruchom: grantflow-log-time --setup" >&2
    exit 1
  fi

  if [[ ! -d "$PAT_CLI_DIR" ]]; then
    echo -e "${RED}ERROR:${NC} Brak $PAT_CLI_DIR — pat-login-cli musi jechać jako katalog-brat tego skryptu, patrz README." >&2
    exit 1
  fi
  if ! command -v npx &>/dev/null; then
    echo -e "${RED}ERROR:${NC} Brak npx (Node.js) — wymagany do logowania PAT przez przeglądarkę." >&2
    exit 1
  fi
}

# --- Health check ---
# Przez bramę (Caddy + oauth2-proxy) samo /api/health, mimo że @Public() w grant-flow, i tak
# wpada pod forward_auth całego site-blocka — bez sesji/PAT dostaniemy 302, nie 200. To dowód,
# że brama i grant-flow za nią odpowiadają (nie connection refused/timeout), nie dowód pełnego
# zdrowia API — pełny dowód daje dopiero uwierzytelnione wywołanie w api_call. -k: Caddy w
# środowisku dev używa `tls internal` (lokalny dev-CA), nie ma go w systemowym trust store —
# jeśli GRANTFLOW_URL wskazuje na środowisko z prawdziwym certyfikatem, -k jest niegroźnym
# no-opem, nie usuwać go warunkowo tylko dla dev.
check_health() {
  local url="${1:-$GRANTFLOW_URL}"
  local http_code
  http_code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url/api/health" 2>/dev/null) || true
  [[ -n "$http_code" && "$http_code" != "000" ]]
}

# --- Autentykacja (PAT przez iam, TS-SSO-028/033/035) ---

# Zwraca ważny PAT — z cache pat-login-cli, albo (przy pustym cache) po loopback-redirect
# logowaniu w przeglądarce. Nigdy nie loguje samego tokenu (kontrakt pat-login-cli/log.ts).
get_token() {
  (cd "$PAT_CLI_DIR" && IAM_ADMIN_BASE_URL="$IAM_ADMIN_BASE_URL" npx tsx cli.ts)
}

# Kasuje cache tokenu — kontrakt pat-login-cli/index.ts pkt 5: wywołujący na 401 MUSI
# skasować cache, a NIE ponowić starego tokenu; kolejne get_token zrobi świeże logowanie.
invalidate_token() {
  (cd "$PAT_CLI_DIR" && IAM_ADMIN_BASE_URL="$IAM_ADMIN_BASE_URL" npx tsx cli.ts --invalidate) || true
}

# --- HTTP call z autentykacją ---
api_call() {
  local method="$1" path="$2" body="${3:-}"
  local token; token=$(get_token)
  local response http_code

  if [[ -n "$body" ]]; then
    response=$(curl -sk -w "\n%{http_code}" -X "$method" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$body" \
      --connect-timeout 10 \
      "$GRANTFLOW_URL$path" 2>/dev/null) || {
      echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada pod $GRANTFLOW_URL" >&2
      exit 1
    }
  else
    response=$(curl -sk -w "\n%{http_code}" -X "$method" \
      -H "Authorization: Bearer $token" \
      --connect-timeout 10 \
      "$GRANTFLOW_URL$path" 2>/dev/null) || {
      echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada pod $GRANTFLOW_URL" >&2
      exit 1
    }
  fi

  http_code=$(echo "$response" | tail -1)
  local resp_body; resp_body=$(echo "$response" | head -n -1)

  # Retry po 401 — skasuj cache, wymuś świeże logowanie, ponów RAZ (nigdy pętli).
  if [[ "$http_code" == "401" ]]; then
    invalidate_token
    token=$(get_token)
    if [[ -n "$body" ]]; then
      response=$(curl -sk -w "\n%{http_code}" -X "$method" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$body" \
        --connect-timeout 10 \
        "$GRANTFLOW_URL$path" 2>/dev/null) || { echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada" >&2; exit 1; }
    else
      response=$(curl -sk -w "\n%{http_code}" -X "$method" \
        -H "Authorization: Bearer $token" \
        --connect-timeout 10 \
        "$GRANTFLOW_URL$path" 2>/dev/null) || { echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada" >&2; exit 1; }
    fi
    http_code=$(echo "$response" | tail -1)
    resp_body=$(echo "$response" | head -n -1)
  fi

  if [[ "$http_code" == "403" ]]; then
    local msg; msg=$(json_get "$resp_body" "message")
    echo -e "${RED}ERROR:${NC} Brak uprawnień (HTTP 403)${msg:+: $msg}. Sprawdź rolę/uprawnienia w grant-flow" >&2
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
  local project_id="$1" hours="$2" entry_date="$3" description="$4" external_reference="$5" task_id="$6"

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

  if [[ -n "$task_id" ]]; then
    if ! is_uuid "$task_id"; then
      echo -e "${RED}ERROR:${NC} Nieprawidłowy UUID zadania (--task-id): $task_id" >&2
      exit 1
    fi
    body="${body%\}},\"taskId\":\"$task_id\"}"
  fi

  if [[ -n "$external_reference" ]]; then
    local ref_json; ref_json=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$external_reference")
    body="${body%\}},\"externalReference\":$ref_json}"
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
  echo -e "  Brama (API): $GRANTFLOW_URL"
  echo -e "  Panel iam (login PAT): $IAM_ADMIN_BASE_URL"

  if check_health; then
    echo -e "  API: ${GREEN}✓ działa${NC}"
  else
    echo -e "  API: ${RED}✗ nie odpowiada${NC}"
    return
  fi

  local cache_host
  cache_host=$(python3 -c "
import sys
print(sys.argv[1].split('://', 1)[-1])
" "$IAM_ADMIN_BASE_URL")
  if ls "$HOME/.cache/iam-pat-cli/token-${cache_host}"*.json &>/dev/null; then
    echo -e "  Token PAT: ${GREEN}✓ w cache${NC} (odśwież się automatycznie przy 401)"
  else
    echo -e "  Token PAT: ${YELLOW}⚠ brak (pierwsze logowanie w przeglądarce przy następnym użyciu)${NC}"
  fi

  if [[ -f "$PROJECTS_FILE" ]]; then
    local count; count=$(python3 -c "import json; d=json.load(open('$PROJECTS_FILE')); print(len(d))")
    echo -e "  Projekty zmapowane (globalnie): ${GREEN}$count${NC}"
    python3 -c "
import json
d = json.load(open('$PROJECTS_FILE'))
for name, uid in d.items():
    print(f'    {name} → {uid}')
"
  else
    echo -e "  Projekty zmapowane (globalnie): ${YELLOW}0 (użyj --map <nazwa> <uuid>)${NC}"
  fi

  local repo_root; repo_root=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
  if [[ -n "$repo_root" && -f "$repo_root/.grantflow" ]]; then
    echo -e "  Lokalny .grantflow w tym repo: ${GREEN}✓${NC} ($repo_root/.grantflow)"
  fi
}

cmd_setup() {
  echo -e "${BLUE}=== Konfiguracja grant-flow (PAT przez iam) ===${NC}"
  echo ""

  if [[ ! -d "$PAT_CLI_DIR" ]]; then
    echo -e "${RED}ERROR:${NC} Brak $PAT_CLI_DIR — pat-login-cli musi jechać jako katalog-brat tego skryptu." >&2
    exit 1
  fi
  if ! command -v npx &>/dev/null; then
    echo -e "${RED}ERROR:${NC} Brak npx (Node.js) — wymagany do logowania przez przeglądarkę." >&2
    exit 1
  fi

  local url iam_url

  read -rp "URL grant-flow (przez bramę) [https://grant-flow.app.dev.juz-ide.pl]: " url
  url="${url:-https://grant-flow.app.dev.juz-ide.pl}"

  read -rp "URL panelu iam (do wydania PAT) [https://admin.app.dev.juz-ide.pl]: " iam_url
  iam_url="${iam_url:-https://admin.app.dev.juz-ide.pl}"

  # Sprawdź health
  echo -n "Sprawdzam połączenie z grant-flow..."
  if ! curl -sk --connect-timeout 5 "$url/api/health" &>/dev/null; then
    echo -e " ${RED}✗${NC}"
    echo -e "${RED}ERROR:${NC} grant-flow nie odpowiada pod $url"
    echo "Sprawdź, czy oba stosy działają: iam/platform i grant-flow (docker compose up -d w obu)."
    exit 1
  fi
  echo -e " ${GREEN}✓${NC}"

  # Zapisz konfigurację — bez sekretów (URL-e), ale i tak 600 z defensywnej ostrożności.
  cat > "$CONFIG_FILE" << EOF
GRANTFLOW_URL=$url
IAM_ADMIN_BASE_URL=$iam_url
EOF
  chmod 600 "$CONFIG_FILE"

  echo ""
  echo -e "${GREEN}Konfiguracja zapisana do ~/.grantflow${NC}"
  echo ""
  echo "Testuję login PAT — zaraz otworzy się przeglądarka (albo dostaniesz link do wklejenia)."
  echo "Zaloguj się, wybierz aplikację grant-flow, potwierdź wydanie tokenu."

  GRANTFLOW_URL="$url"
  IAM_ADMIN_BASE_URL="$iam_url"
  get_token > /dev/null
  echo -e "${GREEN}✓ Zalogowano${NC}"

  echo ""
  echo "Dostępne projekty:"
  local projects_json; projects_json=$(api_call GET "/api/projects?limit=100") || {
    echo -e "${YELLOW}⚠ Nie udało się pobrać listy — Twoja rola może nie mieć uprawnienia read.project.*.${NC}"
    echo "Nadal możesz logować czas do znanego UUID projektu (--project <uuid> --hours ...)."
    echo ""
    echo -e "${GREEN}Setup zakończony.${NC} Użyj 'grantflow-log-time --status' aby sprawdzić konfigurację."
    return
  }
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

# --- Auto-detekcja brancha ---
# W przeciwieństwie do --commit (opcjonalny, jawny — commit to punkt w czasie, cięższa
# semantyka), branch jest tani i prawie zawsze istotny dla wpisu czasu — auto-detect
# domyślnie WŁĄCZONY, --no-branch jako opt-out. Cicho puste dla detached HEAD / poza gitem.
detect_branch() {
  local branch; branch=$(git branch --show-current 2>/dev/null || echo "")
  echo "$branch"
}

# --- Parser argumentów ---
main() {
  if [[ $# -eq 0 ]]; then
    echo "Użycie:"
    echo "  grantflow-log-time --setup"
    echo "  grantflow-log-time --status"
    echo "  grantflow-log-time --list-projects [--json]"
    echo "  grantflow-log-time --project <uuid> --hours <num> [--date YYYY-MM-DD] [--description \"...\"]"
    echo "                     [--task TS-XXX] [--task-id <uuid>] [--commit [hash]] [--pr <branch-or-pr>] [--no-branch]"
    echo "  grantflow-log-time --today"
    echo "  grantflow-log-time --week"
    echo "  grantflow-log-time --map <repo-name> <project-uuid>"
    echo ""
    echo "Referencje (opcjonalne, można łączyć — trafiają do externalReference):"
    echo "  --task TS-RATE-001          ID zadania z backlogu (tekst)"
    echo "  --task-id <uuid>            ID zadania w grant-flow (pole taskId, jeśli masz UUID)"
    echo "  --commit                    git SHA bieżącego HEAD (auto-detect)"
    echo "  --commit abc1234            konkretny commit hash"
    echo "  --pr feature/billing-rates  nazwa branch lub numer PR (nadpisuje auto-detect brancha)"
    echo "  --no-branch                 wyłącz auto-detekcję bieżącego brancha git"
    exit 0
  fi

  local cmd="" project_id="" hours="" entry_date="" description="" json_flag=""
  local task_ref="" task_id="" commit_ref="" pr_ref="" no_branch=""

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
      --task-id)    task_id="$2"; shift 2 ;;
      --no-branch)  no_branch="1"; shift ;;
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

  # Auto-detekcja brancha — tylko jeśli --pr nie podano jawnie (to samo pole logiczne:
  # "gdzie w historii to się stało") i --no-branch nie zażądano.
  local branch_ref=""
  if [[ -z "$no_branch" && -z "$pr_ref" ]]; then
    branch_ref=$(detect_branch)
  fi

  # Złóż external_reference z dostępnych składników
  local external_reference=""
  if [[ -n "$task_ref" || -n "$commit_ref" || -n "$pr_ref" || -n "$branch_ref" ]]; then
    local parts=()
    [[ -n "$task_ref" ]] && parts+=("$task_ref")
    [[ -n "$commit_ref" ]] && parts+=("$commit_ref")
    [[ -n "$pr_ref" ]] && parts+=("$pr_ref")
    [[ -n "$branch_ref" ]] && parts+=("branch:$branch_ref")
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
        cmd_log_entry "$project_id" "$hours" "$entry_date" "$description" "$external_reference" "$task_id"
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
