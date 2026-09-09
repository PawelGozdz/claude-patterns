#!/usr/bin/env bash
# pre-commit dla projektu SATELITARNEGO podpiętego do claude-patterns (K63b, TASK-KAIZEN-002).
#
# Po co: `.claude/config/runtime.yml` jest MATERIALIZACJĄ `project.yml` + bloków, a nie
# plikiem pisanym ręcznie. Nic go nie odświeżało automatycznie, więc lokalna edycja
# `project.yml` (juz-ide-api-3, 2026-09-05) zostawiała runtime.yml z poprzedniego świata
# i rozjazd wychodził dopiero przy centralnym audycie — czasem po tygodniach. Ten hook
# domyka to w miejscu, gdzie zmiana powstaje.
#
# Instalacja (z katalogu projektu satelitarnego):
#     cp <claude-patterns>/templates/git-hooks/pre-commit-satellite.sh .git/hooks/pre-commit
#     chmod +x .git/hooks/pre-commit
# Projekt, który ma już swój `pre-commit` (lefthook, husky, simple-git-hooks), powinien
# wywołać ten plik jako jeden z kroków zamiast go nadpisywać.
#
# Wyjście 1 tylko wtedy, gdy człowiek musi coś zrobić. Sama rematerializacja nie jest
# powodem do przerwania commita — plik po prostu wraca do stanu wynikającego ze źródeł.

set -uo pipefail

# ── 1. Czy ten commit w ogóle dotyka źródeł kompozycji ─────────────────────
STAGED=$(git diff --cached --name-only --diff-filter=ACMR)
echo "$STAGED" | grep -qE '^\.claude/(config/project\.yml|blocks/[^/]+\.yml)$' || exit 0

# ── 2. Gdzie jest claude-patterns ──────────────────────────────────────────
# Kolejność: jawny env, potem konwencja symlinków z `setup-project.sh`. Projekt linkuje
# albo cały katalog `.claude/knowledge/patterns` → <claude-patterns>/patterns
# (vytches-ddd), albo każdą kategorię osobno → <claude-patterns>/patterns/<kategoria>
# (reszta floty), więc rozwiązujemy dowiązanie i idziemy w górę do katalogu, w którym
# faktycznie leży `scripts/materialize-runtime.mjs`. Zgadywanie po nazwie katalogu
# złamałoby się przy pierwszym klonie pod inną ścieżką.
find_patterns_repo() {
  if [ -n "${CLAUDE_PATTERNS_DIR:-}" ] && [ -f "$CLAUDE_PATTERNS_DIR/scripts/materialize-runtime.mjs" ]; then
    printf '%s\n' "$CLAUDE_PATTERNS_DIR"; return 0
  fi

  local candidate resolved dir
  for candidate in .claude/knowledge/patterns .claude/knowledge/patterns/* .claude/knowledge/rules .claude/agents/*; do
    [ -L "$candidate" ] || continue
    resolved=$(readlink -f "$candidate" 2>/dev/null) || continue
    dir="$resolved"
    while [ "$dir" != "/" ] && [ -n "$dir" ]; do
      if [ -f "$dir/scripts/materialize-runtime.mjs" ]; then printf '%s\n' "$dir"; return 0; fi
      dir=$(dirname "$dir")
    done
  done
  return 1
}

CP=$(find_patterns_repo) || {
  echo "pre-commit: nie znalazłem claude-patterns." >&2
  echo "  Ten projekt zmienia .claude/config/project.yml albo .claude/blocks/*.yml," >&2
  echo "  więc runtime.yml wymaga rematerializacji, a nie ma czym jej zrobić." >&2
  echo "  → ustaw CLAUDE_PATTERNS_DIR=/ścieżka/do/claude-patterns albo napraw symlinki:" >&2
  echo "    <claude-patterns>/scripts/setup-project.sh $(pwd)" >&2
  exit 1
}

RUNTIME=.claude/config/runtime.yml

# ── 3. Rematerializacja — tylko gdy naprawdę jest nieaktualna ──────────────
# Najpierw `--check`, bo materializacja bezwarunkowa przepisuje `materialized_at` przy
# każdym uruchomieniu i zostawiałaby po każdym commicie zmieniony plik bez żadnej zmiany
# treści. Hook, który brudzi drzewo robocze za każdym razem, uczy ludzi go ignorować.
if node "$CP/scripts/materialize-runtime.mjs" . --check >/dev/null 2>&1; then
  :
elif node "$CP/scripts/materialize-runtime.mjs" . ; then
  echo "pre-commit: runtime.yml zmaterializowany na nowo z bieżącej kompozycji."
else
  echo "pre-commit: materializacja runtime.yml nie powiodła się — popraw kompozycję i spróbuj ponownie." >&2
  exit 1
fi

# ── 4. Czy runtime.yml jedzie w tym samym commicie ─────────────────────────
# Nie w każdym repo powinien: w większości floty `runtime.yml` siedzi w `.gitignore` jako
# artefakt lokalny, a w części (juz-ide-mobile-app) jest śledzony i wtedy commit ze zmianą
# `project.yml` bez odświeżonego `runtime.yml` zostawia w repo stan wewnętrznie sprzeczny.
# Hook czyta więc, jak repo traktuje ten plik, zamiast narzucać jedną odpowiedź.
if git check-ignore -q "$RUNTIME" 2>/dev/null; then
  echo "pre-commit: runtime.yml aktualny (artefakt lokalny, poza gitem — nic do dodania)."
  exit 0
fi

if ! git ls-files --error-unmatch "$RUNTIME" >/dev/null 2>&1 && \
   ! git diff --cached --name-only | grep -qx "$RUNTIME"; then
  echo "pre-commit: runtime.yml aktualny, ale nie jest śledzony w tym repo — pomijam." >&2
  exit 0
fi

# Porównanie po `source_hash`, nie po bajtach: `materialized_at` różni się przy każdym
# przebiegu i nie niesie żadnej informacji o kompozycji. Porównywanie całych plików
# kazałoby dorzucać do commita zmianę samego znacznika czasu.
hash_of() { grep -m1 -oE '^source_hash:[[:space:]]*"?[a-f0-9]+' "$1" 2>/dev/null | grep -oE '[a-f0-9]+$'; }
STAGED_HASH=$(git show ":$RUNTIME" 2>/dev/null | grep -m1 -oE '^source_hash:[[:space:]]*"?[a-f0-9]+' | grep -oE '[a-f0-9]+$')
DISK_HASH=$(hash_of "$RUNTIME")

if [ -n "$DISK_HASH" ] && [ "$STAGED_HASH" != "$DISK_HASH" ]; then
  echo "pre-commit: zmieniłeś kompozycję, a odświeżony runtime.yml został poza commitem." >&2
  echo "  W commicie: source_hash ${STAGED_HASH:-brak}; na dysku: $DISK_HASH." >&2
  echo "  Stary runtime.yml obok nowego project.yml to dokładnie ten rozjazd," >&2
  echo "  którego szuka potem audyt centrali." >&2
  echo "  → git add $RUNTIME" >&2
  exit 1
fi

echo "pre-commit: runtime.yml zgodny z kompozycją (source_hash $DISK_HASH)."
exit 0
