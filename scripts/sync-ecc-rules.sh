#!/bin/bash
# sync-ecc-rules.sh — synchronizacja rules/common/ z regułami wtyczki ECC.
#
# Po co: audyt 2026-09-07 (D7) pokazał, że `rules/common/` to NIEJAWNY, przeterminowany
# fork ECC — cztery pliki bajt w bajt identyczne, a trzy kolejne to ścisłe PODZBIORY
# nowszej wersji upstreamu (nasze kopie z 2026-03-29, ECC z 2026-06-29): brakowało
# KISS/DRY/YAGNI w coding-style, sekcji AAA w testing i dwóch wierszy w tabeli agentów.
# Nikt tego nie zauważył, bo nic nie porównywało tych plików z niczym.
#
# Dlaczego fork, a nie usunięcie kopii i `requires_ecc: rules/common` (K87,
# TASK-KAIZEN-002): reguły ECC nie ładują się z katalogu wtyczki — ECC instaluje je
# WŁASNYM `rules/install.sh` do `.claude/rules/`, dokładnie tam, gdzie 13 satelitów ma
# już symlink `.claude/rules/common` → `claude-patterns/rules/common`. Usunięcie
# katalogu zerwałoby te symlinki naraz we wszystkich projektach, a wskazanie na ECC
# oznaczałoby drugi instalator piszący w to samo miejsce. Fork z jawną wersją i tym
# skryptem kosztuje jedno uruchomienie na kwartał i nie rusza topologii instalacji.
#
# Użycie:
#   ./scripts/sync-ecc-rules.sh --diff      # tylko pokaż różnice, nic nie zmieniaj
#   ./scripts/sync-ecc-rules.sh --check     # exit 1 przy dryfie pliku ŚLEDZONEGO (CI)
#   ./scripts/sync-ecc-rules.sh             # interaktywnie: diff → potwierdzenie → apply
#   ./scripts/sync-ecc-rules.sh --apply     # bez pytania
#   ./scripts/sync-ecc-rules.sh --source <katalog>   # inne źródło niż domyślne ECC
#
# Trzy kategorie plików (deklarowane niżej, nie zgadywane):
#   ŚLEDZONE — mają być identyczne z ECC; dryf = do nadpisania.
#   FORK     — świadomie różne; skrypt pokazuje diff, ale NIGDY nie nadpisuje.
#              Każdy wpis ma podany powód — fork bez powodu to znowu fork niejawny.
#   LOKALNE  — nie istnieją w ECC; skrypt ich nie dotyka.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${HOME}/.claude/plugins/marketplaces/ecc/rules/common"
TARGET_DIR="$REPO_DIR/rules/common"
VERSION_FILE="$TARGET_DIR/UPSTREAM_VERSION"
MODE="interactive"

source "$REPO_DIR/scripts/lib/common.sh"

# Pliki utrzymywane w zgodzie z ECC — dryf jest błędem do naprawienia syncem.
TRACKED=(agents.md coding-style.md git-workflow.md hooks.md patterns.md security.md testing.md)

# Świadome forki: nazwa|powód. Skrypt pokazuje różnicę, ale jej nie zasypuje.
FORKED=(
  "performance.md|tabela doboru modeli podaje konkretne generacje (Haiku 4.5 / Sonnet 5 / Opus 4.5); ECC ma gołe nazwy rodzin, cofnięcie tego zabrałoby informację, po której realnie wybieramy model w slotach bloków"
  "development-workflow.md|krok 0 wskazuje Exa MCP jako narzędzie researchu tego środowiska; ECC każe najpierw Context7, którego u nas nie ma w .mcp.json żadnego satelity"
)

# Pliki, których w ECC nie ma w ogóle.
LOCAL_ONLY=(searching.md)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)  MODE="apply";  shift ;;
    --diff)   MODE="diff";   shift ;;
    --check)  MODE="check";  shift ;;
    --source) SOURCE_DIR="${2:?--source wymaga katalogu}"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Nieznany argument: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo -e "${RED}❌ Brak źródła:${NC} $SOURCE_DIR"
  echo "   Zainstaluj wtyczkę ECC albo wskaż katalog przez --source."
  exit 1
fi

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}ECC common rules — sync${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Źródło:${NC} $SOURCE_DIR"
echo -e "${BLUE}Cel:${NC}    $TARGET_DIR"
echo ""

is_forked() {
  local name="$1" entry
  for entry in "${FORKED[@]}"; do [[ "${entry%%|*}" == "$name" ]] && return 0; done
  return 1
}

drifted=()
missing_upstream=()

echo -e "${BLUE}[1/3]${NC} Porównanie plików śledzonych"
for name in "${TRACKED[@]}"; do
  src="$SOURCE_DIR/$name"; dst="$TARGET_DIR/$name"
  if [[ ! -f "$src" ]]; then
    missing_upstream+=("$name")
    echo -e "  ${YELLOW}⚠ $name${NC} — nie ma go już w ECC (zmiana po stronie upstreamu)"
  elif [[ ! -f "$dst" ]] || ! cmp -s "$src" "$dst"; then
    drifted+=("$name")
    echo -e "  ${YELLOW}≠ $name${NC}"
  else
    echo -e "  ${GREEN}= $name${NC}"
  fi
done

echo ""
echo -e "${BLUE}[2/3]${NC} Forki i pliki lokalne (nigdy nadpisywane)"
for entry in "${FORKED[@]}"; do
  name="${entry%%|*}"; reason="${entry#*|}"
  if [[ -f "$SOURCE_DIR/$name" ]] && cmp -s "$SOURCE_DIR/$name" "$TARGET_DIR/$name"; then
    echo -e "  ${YELLOW}⚠ $name${NC} — zbiegł się z ECC; zdejmij go z listy FORKED w tym skrypcie"
  else
    echo -e "  ${BLUE}⑂ $name${NC} — $reason"
  fi
done
for name in "${LOCAL_ONLY[@]}"; do
  if [[ -f "$SOURCE_DIR/$name" ]]; then
    echo -e "  ${YELLOW}⚠ $name${NC} — pojawił się w ECC; przenieś go do TRACKED albo do FORKED"
  else
    echo -e "  ${BLUE}◦ $name${NC} — lokalny, brak odpowiednika w ECC"
  fi
done

if [[ ${#drifted[@]} -eq 0 && ${#missing_upstream[@]} -eq 0 ]]; then
  echo ""
  echo -e "${GREEN}✅ Pliki śledzone zgodne z ECC.${NC}"
  exit 0
fi

echo ""
echo -e "${BLUE}[3/3]${NC} Różnice (- ECC, + nasze)"
for name in "${drifted[@]}"; do
  echo -e "${BLUE}── $name ──${NC}"
  diff -u "$SOURCE_DIR/$name" "$TARGET_DIR/$name" || true
  echo ""
done

case "$MODE" in
  diff)
    echo -e "${YELLOW}Tryb --diff: nic nie zmieniono.${NC}"
    exit 0
    ;;
  check)
    echo -e "${RED}❌ Dryf w ${#drifted[@]} pliku(ach) śledzonym(ch) wobec ECC.${NC}"
    echo "   → ./scripts/sync-ecc-rules.sh --diff  (przejrzyj), potem --apply"
    exit 1
    ;;
  interactive)
    read -r -p "Nadpisać pliki śledzone wersją z ECC? [y/N] " answer
    [[ "$answer" =~ ^[Yy]$ ]] || { echo "Przerwane."; exit 0; }
    ;;
esac

for name in "${drifted[@]}"; do
  [[ -f "$SOURCE_DIR/$name" ]] || continue
  cp "$SOURCE_DIR/$name" "$TARGET_DIR/$name"
  echo -e "  ${GREEN}Zaktualizowano:${NC} rules/common/$name"
done

ecc_commit=$(git -C "$(dirname "$SOURCE_DIR")/.." log -1 --format=%H 2>/dev/null || echo "unknown")
ecc_version=$(grep -m1 '"version"' "$(dirname "$SOURCE_DIR")/../package.json" 2>/dev/null \
  | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "unknown")
{
  echo "# Skąd pochodzi rules/common/ — pilnowane przez scripts/sync-ecc-rules.sh."
  echo "upstream: ECC plugin (rules/common)"
  echo "upstream_version: \"$ecc_version\""
  echo "upstream_commit: \"$ecc_commit\""
  echo "synced_at: \"$(date +%Y-%m-%d)\""
  echo "tracked: [$(printf '%s, ' "${TRACKED[@]}" | sed 's/, $//')]"
  echo "forked: [$(for e in "${FORKED[@]}"; do printf '%s, ' "${e%%|*}"; done | sed 's/, $//')]"
  echo "local_only: [$(printf '%s, ' "${LOCAL_ONLY[@]}" | sed 's/, $//')]"
} > "$VERSION_FILE"
echo -e "  ${GREEN}Zapisano:${NC} rules/common/UPSTREAM_VERSION"
echo ""
echo -e "${GREEN}✅ Gotowe.${NC} Zmiany propagują się natychmiast do 13 projektów przez symlink"
echo "   .claude/rules/common — przejrzyj diff przed commitem."
