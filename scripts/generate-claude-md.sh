#!/bin/bash
# generate-claude-md.sh - Generate CLAUDE.md from composable templates + project.yml
# Pure bash, zero external dependencies (no yq/python needed)
#
# Template composition: core.md + stacks/{stack_profile}.md + CLAUDE-LOCAL.md
# Adding new stack: create templates/stacks/{name}.md - zero generator changes needed
#
# Usage: ./generate-claude-md.sh [project-path]
# Default: current directory

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PATTERNS_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$PATTERNS_DIR/templates"
CORE_TEMPLATE="$TEMPLATES_DIR/core.md"

PROJECT_DIR="${1:-.}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
CONFIG_DIR="$PROJECT_DIR/.claude/config"
PROJECT_YML="$CONFIG_DIR/project.yml"
LOCAL_MD="$CONFIG_DIR/CLAUDE-LOCAL.md"
LOCAL_MD_ROOT_FALLBACK="$PROJECT_DIR/CLAUDE-LOCAL.md"
OUTPUT="$PROJECT_DIR/CLAUDE.md"

source "$SCRIPT_DIR/lib/common.sh"

# --- Helpers ---

# Odczyt project.yml — jeden parser dla wszystkich skryptów: scripts/lib/project-yml.mjs
#
# Wcześniej ta kopia grep/sed ucinała komentarz inline, a bliźniacza kopia w
# setup-project.sh wciągała go do wartości — ten sam plik dawał dwie różne odpowiedzi
# zależnie od tego, który skrypt akurat pytał (K65). Komentarze i cudzysłowy zdejmuje
# teraz parser YAML, nie łańcuch sedów.
#
# `|| true` — parser kończy się kodem 1, gdy klucza nie ma (pole opcjonalne); pod
# `set -e` nonzero zabiłby `VAR=$(yml_get ...)`.

# Usage: yml_get "project.name"
yml_get() {
  node "$SCRIPT_DIR/lib/project-yml.mjs" "$PROJECT_YML" get "$1" || true
}

# Usage: yml_list "skills"
yml_list() {
  node "$SCRIPT_DIR/lib/project-yml.mjs" "$PROJECT_YML" list "$1" || true
}

# --- Validate ---

if [[ ! -f "$CORE_TEMPLATE" ]]; then
  echo -e "${RED}Error: Core template not found: $CORE_TEMPLATE${NC}" >&2
  exit 1
fi

if [[ ! -f "$PROJECT_YML" ]]; then
  echo -e "${RED}Error: project.yml not found: $PROJECT_YML${NC}" >&2
  echo -e "Run: cp $TEMPLATES_DIR/project.yml.example $PROJECT_YML" >&2
  exit 1
fi

# --- Determine stack profile ---

STACK_PROFILE=$(yml_get "project.stack_profile")
STACK_TEMPLATE="$TEMPLATES_DIR/stacks/${STACK_PROFILE}.md"

if [[ -n "$STACK_PROFILE" && -f "$STACK_TEMPLATE" ]]; then
  echo -e "${GREEN}Stack profile:${NC} ${STACK_PROFILE}"
else
  if [[ -n "$STACK_PROFILE" ]]; then
    echo -e "${YELLOW}Warning: Stack profile '${STACK_PROFILE}' not found at ${STACK_TEMPLATE}${NC}" >&2
    echo -e "${YELLOW}Generating with core template only${NC}" >&2
  fi
  STACK_TEMPLATE=""
fi

# --- Extract values ---

PROJECT_NAME=$(yml_get "project.name")
PROJECT_DESC=$(yml_get "project.description")
STACK=$(yml_get "project.stack")
TESTING=$(yml_get "project.testing")

CMD_ANALYZE=$(yml_get "entry_points.analyze")
CMD_ORCH=$(yml_get "entry_points.orchestrate")
CMD_SCAFF=$(yml_get "entry_points.scaffold")
CMD_PROG=$(yml_get "entry_points.progress")

COST_OPUS=$(yml_get "cost.opus")
COST_SONNET=$(yml_get "cost.sonnet")
COST_HAIKU=$(yml_get "cost.haiku")

# Stack-specific fields (for marker replacement in templates)
DDD_LIBRARY=$(yml_get "project.ddd_library")
DATABASE=$(yml_get "project.database")
FRAMEWORK=$(yml_get "project.framework")
STATE_MANAGEMENT=$(yml_get "project.state_management")
PLATFORMS=$(yml_get "project.platforms")

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# --- Generate dynamic project table ---
# Only includes rows for fields that have values

PROJECT_TABLE="| Aspect | Value |\n|--------|-------|\n"
PROJECT_TABLE="${PROJECT_TABLE}| Stack | ${STACK} |\n"

if [[ -n "$TESTING" ]]; then
  PROJECT_TABLE="${PROJECT_TABLE}| Testing | ${TESTING} |\n"
fi

# Stack-specific fields (only added if present in project.yml)
for field in ddd_library database framework state_management platforms runtime; do
  value=$(yml_get "project.${field}")
  if [[ -n "$value" ]]; then
    # Convert field_name to display label with known acronyms
    label=$(echo "$field" | sed 's/_/ /g' | sed 's/\b\(.\)/\u\1/g')
    # Fix known acronyms
    label="${label/Ddd/DDD}"
    label="${label/Api/API}"
    label="${label/Sdk/SDK}"
    label="${label/Ui/UI}"
    PROJECT_TABLE="${PROJECT_TABLE}| ${label} | ${value} |\n"
  fi
done

# --- Generate rules list ---

RULES=""
while IFS= read -r rule; do
  RULES="${RULES}- ${rule}\n"
done < <(yml_list "rules")

# --- Generate contexts table ---

# Kolumna Tests pojawia się tylko wtedy, gdy projekt faktycznie podaje liczby —
# pusta kolumna sugerowałaby zero testów, a brakująca mówi prawdę: nie mierzymy tego tutaj.
if grep -qE "^[[:space:]]+tests:" "$PROJECT_YML"; then
  CTX_HAS_TESTS=1
  CONTEXTS_TABLE="| Context | Status | Tests | Notes |\n|---------|--------|-------|-------|\n"
else
  CTX_HAS_TESTS=0
  CONTEXTS_TABLE="| Context | Status | Notes |\n|---------|--------|-------|\n"
fi
in_contexts=0
ctx_name="" ctx_status="" ctx_tests="" ctx_notes=""

while IFS= read -r line; do
  if [[ "$line" == "contexts:" ]]; then
    in_contexts=1
    continue
  fi
  if [[ $in_contexts -eq 1 ]]; then
    if [[ "$line" =~ ^[a-z] && "$line" != "  "* ]]; then
      if [[ -n "$ctx_name" ]]; then
        if [[ $CTX_HAS_TESTS -eq 1 ]]; then
          CONTEXTS_TABLE="${CONTEXTS_TABLE}| ${ctx_name} | ${ctx_status} | ${ctx_tests} | ${ctx_notes} |\n"
        else
          CONTEXTS_TABLE="${CONTEXTS_TABLE}| ${ctx_name} | ${ctx_status} | ${ctx_notes} |\n"
        fi
        ctx_name=""
      fi
      break
    fi
    if [[ "$line" =~ ^"  - name: " ]]; then
      if [[ -n "$ctx_name" ]]; then
        if [[ $CTX_HAS_TESTS -eq 1 ]]; then
          CONTEXTS_TABLE="${CONTEXTS_TABLE}| ${ctx_name} | ${ctx_status} | ${ctx_tests} | ${ctx_notes} |\n"
        else
          CONTEXTS_TABLE="${CONTEXTS_TABLE}| ${ctx_name} | ${ctx_status} | ${ctx_notes} |\n"
        fi
      fi
      ctx_name=$(echo "$line" | sed 's/^  - name: //')
      ctx_status="" ctx_tests="-" ctx_notes=""
    elif [[ "$line" =~ ^"    status: " ]]; then
      ctx_status=$(echo "$line" | sed 's/^    status: //')
    elif [[ "$line" =~ ^"    tests: " ]]; then
      ctx_tests=$(echo "$line" | sed 's/^    tests: //')
    elif [[ "$line" =~ ^"    notes: " ]]; then
      ctx_notes=$(echo "$line" | sed 's/^    notes: //' | sed 's/^"//' | sed 's/"$//')
    fi
  fi
done < "$PROJECT_YML"
if [[ $in_contexts -eq 1 && -n "$ctx_name" ]]; then
  if [[ $CTX_HAS_TESTS -eq 1 ]]; then
          CONTEXTS_TABLE="${CONTEXTS_TABLE}| ${ctx_name} | ${ctx_status} | ${ctx_tests} | ${ctx_notes} |\n"
        else
          CONTEXTS_TABLE="${CONTEXTS_TABLE}| ${ctx_name} | ${ctx_status} | ${ctx_notes} |\n"
        fi
fi

# --- Generate docs list ---

DOCS_LIST=""
while IFS= read -r doc; do
  DOCS_LIST="${DOCS_LIST}- [${doc}](./${doc})\n"
done < <(yml_list "docs")

# --- Generate rules reference ---
#
# IMPORTANT: We intentionally do NOT @import rules into CLAUDE.md.
# @imports load on every prompt (also propagate to every subagent),
# costing ~3-4k tokens per turn even for questions that never touch code.
# Instead, agents (especially implementers/verifiers) Read the specific
# rule file on demand before editing code.

PROJECT_LANGUAGE=$(yml_get "project.language")

RULES_IMPORTS=""

if [[ -n "$PROJECT_LANGUAGE" ]]; then
  RULES_IMPORTS="## Coding Standards & Rules\n\n"
  RULES_IMPORTS="${RULES_IMPORTS}Rules live under \`.claude/rules/{common,${PROJECT_LANGUAGE}}/\`. Implementers/verifiers Read the relevant file BEFORE editing code — do NOT inline-import all rules (wastes context on every prompt and every subagent spawn).\n"
fi

# --- Generate skills reference ---

# --- Generate skills reference list (NOT @import — skills are auto-discovered) ---
# Skills are loaded by Claude Code via tool descriptions, NOT imported into CLAUDE.md.
# Importing full SKILL.md files wastes ~3700 lines of context per session.
# We only list them as a reference so the user knows what's available.

SKILLS_IMPORTS=""
SKILLS_COUNT=0
SKILLS_CATEGORIES_LIST=""

# K34 (TASK-KAIZEN-001, 2026-08-27): dawniej ta sekcja wypisywała KAŻDY skill z osobna
# (37 linii dla juz-ide-api-1) — czysta duplikacja tego, co Claude Code i tak dostarcza
# modelowi natywnie przez rejestr Skill/komend (patrz komentarz wyżej: "NOT imported into
# CLAUDE.md"). Human-facing wartość (orientacja "co tu jest") zachowana jako zwięzłe
# podsumowanie liczby + kategorii, bez pełnego zrzutu nazw — pełna lista i tak jest
# widoczna z poziomu `/help` i samych plików `.claude/skills/*/SKILL.md`.
while IFS= read -r category; do
  [[ -z "$category" ]] && continue
  CATEGORY_DIR="$PATTERNS_DIR/skills/$category"
  if [[ -d "$CATEGORY_DIR" ]]; then
    category_count=0
    for skill_dir in "$CATEGORY_DIR"/*/; do
      [[ -d "$skill_dir" ]] || continue
      skill_md="$skill_dir/SKILL.md"
      [[ -f "$skill_md" ]] && category_count=$((category_count + 1))
    done
    if [[ $category_count -gt 0 ]]; then
      SKILLS_COUNT=$((SKILLS_COUNT + category_count))
      SKILLS_CATEGORIES_LIST="${SKILLS_CATEGORIES_LIST}, ${category} (${category_count})"
    fi
  fi
done < <(yml_list "skills")

if [[ $SKILLS_COUNT -gt 0 ]]; then
  SKILLS_IMPORTS="## Available Skills\n\n"
  SKILLS_IMPORTS="${SKILLS_IMPORTS}${SKILLS_COUNT} skills auto-discovered from \`.claude/skills/\` "
  SKILLS_IMPORTS="${SKILLS_IMPORTS}(native Skill-tool discovery — not listed individually here to save "
  SKILLS_IMPORTS="${SKILLS_IMPORTS}context on every session; see \`.claude/skills/*/SKILL.md\` or \`/help\` "
  SKILLS_IMPORTS="${SKILLS_IMPORTS}for the full list). Categories: ${SKILLS_CATEGORIES_LIST#, }.\n"
fi

# --- Load stack-specific content ---

STACK_CONTENT=""
if [[ -n "$STACK_TEMPLATE" && -f "$STACK_TEMPLATE" ]]; then
  STACK_CONTENT=$(cat "$STACK_TEMPLATE")
fi

# --- Load local content ---

LOCAL_CONTENT=""
if [[ -f "$LOCAL_MD" ]]; then
  LOCAL_CONTENT=$(cat "$LOCAL_MD")
elif [[ -f "$LOCAL_MD_ROOT_FALLBACK" ]]; then
  # Kanoniczna lokalizacja to .claude/config/CLAUDE-LOCAL.md; fallback na root repo
  # istnieje, bo jeden projekt (iam, 2026-08-24) trzymał plik w roocie i generator
  # go cicho gubił — pięć krytycznych nadpisań nigdy nie trafiało do CLAUDE.md.
  echo -e "${YELLOW}⚠${NC}  CLAUDE-LOCAL.md znaleziony w roocie projektu, nie w .claude/config/ —"
  echo "   działa, ale rozważ przeniesienie do $LOCAL_MD (kanoniczna lokalizacja)."
  LOCAL_CONTENT=$(cat "$LOCAL_MD_ROOT_FALLBACK")
fi

# --- Compose template: core + stack profile ---

CONTENT=$(cat "$CORE_TEMPLATE")

# --- Replace simple markers ---

CONTENT="${CONTENT//%%TIMESTAMP%%/$TIMESTAMP}"
CONTENT="${CONTENT//%%PROJECT_NAME%%/$PROJECT_NAME}"
CONTENT="${CONTENT//%%PROJECT_DESCRIPTION%%/$PROJECT_DESC}"
CONTENT="${CONTENT//%%STACK%%/$STACK}"
CONTENT="${CONTENT//%%TESTING%%/$TESTING}"
RUNTIME_YML="$PROJECT_DIR/.claude/config/runtime.yml"

# --- Reguły DDD, warunkowo (K111) ---
#
# Ta sekcja stała bezwarunkowo w ~/.claude/CLAUDE.md, linijkę nad "nie zakładaj
# NestJS/TypeScript" — więc dostawał ją każdy projekt, także Flutter, Python
# i docs-only. Reguły należą do bloku, nie do globalnej konfiguracji: wchodzą
# tylko wtedy, gdy kompozycja projektu zawiera `ddd/core`.
#
# Źródłem prawdy jest rozwinięta lista z runtime.yml (materializacja rozwija
# alias `ddd` → ddd/core, ddd/layers, ...). Kiedy runtime.yml jeszcze nie
# istnieje — pierwszy setup — czytamy project.yml i honorujemy alias.
DDD_RULES_SECTION=""
# Prawdziwy parser, nie awk: materializacja zapisuje `stack_blocks` w stylu
# flow (`[nestjs, ddd/core, ...]`), a project.yml bywa w stylu blokowym —
# jedno wyrażenie regularne nie obsłuży obu, a cicha pomyłka daje CLAUDE.md
# bez reguł tam, gdzie mają obowiązywać.
DDD_BLOCKS=""
if [[ -f "$RUNTIME_YML" ]]; then
  DDD_BLOCKS=$(node "$SCRIPT_DIR/lib/project-yml.mjs" "$RUNTIME_YML" list stack_blocks || true)
fi
if [[ -z "$DDD_BLOCKS" ]]; then
  DDD_BLOCKS=$(yml_list "project.stack_blocks")
fi
if grep -qxE 'ddd(/core)?' <<<"$DDD_BLOCKS"; then
  DDD_TEMPLATE="$TEMPLATES_DIR/ddd-core-rules.md"
  [[ -f "$DDD_TEMPLATE" ]] && DDD_RULES_SECTION="$(cat "$DDD_TEMPLATE")

---"
fi

# --- Taksonomia tagów z runtime.yml (ADR 0008) ---
# Słownik żyje w claude-patterns (rdzeń) + .claude/taxonomy.yml (projekt) i jest scalany
# do runtime.yml. Tutaj trafia do CLAUDE.md, bo inaczej agent pracujący w repo projektu
# nie ma skąd wiedzieć, że `api:geo:radius` jest poprawnym tagiem, a `geo-radius` nie.
TAXONOMY_SECTION=""
if [[ -f "$RUNTIME_YML" ]] && grep -q "^taxonomy:" "$RUNTIME_YML"; then
  TAX_STACKS=$(awk '/^taxonomy:/{t=1} t&&/^  stacks:/{s=1;next} s&&/^    - /{gsub(/^    - | #.*/,"");printf "%s%s", sep, $0; sep=", "} s&&/^  [a-z]/{exit}' "$RUNTIME_YML")
  TAX_AREAS=$(awk '/^taxonomy:/{t=1} t&&/^  areas:/{a=1;next} a&&/^    - /{gsub(/^    - | #.*/,"");printf "%s%s", sep, $0; sep=", "} a&&/^  [a-z]/{exit}' "$RUNTIME_YML")
  TAXONOMY_SECTION=$(cat <<TAXEOF
## Tag taxonomy

Syntax: \`<stack>:<area>[:<variant>]\` — always in that order, and always quoted in YAML (\`"api:tests"\`), because an unquoted colon can be parsed as a nested key.

| Level | Allowed values |
|-------|----------------|
| stack | ${TAX_STACKS} |
| area | ${TAX_AREAS} |
| variant | any kebab-case — report a new one rather than breeding synonyms (\`jwt\` vs \`json-web-token\`) |

Tags go on things that are **selected per task**: ADRs/BDRs (\`tags:\` in frontmatter), patterns (\`**Tags**:\`), layers and blocks. Hooks and skills are not tagged — those are picked by file path or by description.

Levels 1 and 2 are closed: a value outside the table is an error, not a new tag. Adding a project area is a deliberate two-step — put it in \`.claude/config/taxonomy.yml\`, re-run setup so it lands in \`runtime.yml\`, then use it. The core vocabulary is shared across all repositories and must not be redefined locally. Full dictionary including variants: the \`taxonomy:\` section of \`.claude/config/runtime.yml\`.

---
TAXEOF
)
fi
CONTENT="${CONTENT//%%DDD_RULES%%/$DDD_RULES_SECTION}"
CONTENT="${CONTENT//%%TAXONOMY%%/$TAXONOMY_SECTION}"
CONTENT="${CONTENT//%%CMD_ANALYZE%%/${CMD_ANALYZE:-/analyze}}"
CONTENT="${CONTENT//%%CMD_ORCHESTRATE%%/$CMD_ORCH}"
CONTENT="${CONTENT//%%CMD_SCAFFOLD%%/$CMD_SCAFF}"
CONTENT="${CONTENT//%%CMD_PROGRESS%%/$CMD_PROG}"
CONTENT="${CONTENT//%%COST_OPUS%%/$COST_OPUS}"
CONTENT="${CONTENT//%%COST_SONNET%%/$COST_SONNET}"
CONTENT="${CONTENT//%%COST_HAIKU%%/$COST_HAIKU}"

# --- Replace multi-line markers using temp file + awk ---

TMPFILE=$(mktemp)
echo "$CONTENT" > "$TMPFILE"

# Replace %%PROJECT_TABLE%%
awk -v replacement="$(echo -e "$PROJECT_TABLE")" '{gsub(/%%PROJECT_TABLE%%/, replacement)}1' "$TMPFILE" > "${TMPFILE}.2" && mv "${TMPFILE}.2" "$TMPFILE"

# Replace %%RULES%%
awk -v replacement="$(echo -e "$RULES")" '{gsub(/%%RULES%%/, replacement)}1' "$TMPFILE" > "${TMPFILE}.2" && mv "${TMPFILE}.2" "$TMPFILE"

# Replace %%RULES_IMPORTS%% (using perl to avoid awk & backreference issues)
if [[ -n "$RULES_IMPORTS" ]]; then
  export MARKER_REPLACEMENT="$(echo -e "$RULES_IMPORTS")"
  perl -0777 -i -pe 's/%%RULES_IMPORTS%%/$ENV{MARKER_REPLACEMENT}/g' "$TMPFILE"
else
  sed -i 's/%%RULES_IMPORTS%%//' "$TMPFILE"
fi

# Replace %%SKILLS_IMPORTS%% (using perl to avoid awk & backreference issues)
if [[ -n "$SKILLS_IMPORTS" ]]; then
  export MARKER_REPLACEMENT="$(echo -e "$SKILLS_IMPORTS")"
  perl -0777 -i -pe 's/%%SKILLS_IMPORTS%%/$ENV{MARKER_REPLACEMENT}/g' "$TMPFILE"
else
  sed -i 's/%%SKILLS_IMPORTS%%//' "$TMPFILE"
fi
unset MARKER_REPLACEMENT

# Replace %%STACK_CONTENT%% (entire stack profile section)
if [[ -n "$STACK_CONTENT" ]]; then
  # Stack content may contain markers too, replace them all
  STACK_CONTENT="${STACK_CONTENT//%%COST_OPUS%%/$COST_OPUS}"
  STACK_CONTENT="${STACK_CONTENT//%%COST_SONNET%%/$COST_SONNET}"
  STACK_CONTENT="${STACK_CONTENT//%%COST_HAIKU%%/$COST_HAIKU}"
  STACK_CONTENT="${STACK_CONTENT//%%DDD_LIBRARY%%/$DDD_LIBRARY}"
  STACK_CONTENT="${STACK_CONTENT//%%DATABASE%%/$DATABASE}"
  STACK_CONTENT="${STACK_CONTENT//%%FRAMEWORK%%/$FRAMEWORK}"
  STACK_CONTENT="${STACK_CONTENT//%%STATE_MANAGEMENT%%/$STATE_MANAGEMENT}"
  STACK_CONTENT="${STACK_CONTENT//%%PLATFORMS%%/$PLATFORMS}"
  # Escape & in replacement (awk treats & as matched text in gsub)
  # Double-escape: bash \& → awk \\& → literal &
  STACK_ESCAPED="${STACK_CONTENT//&/\\\\&}"
  awk -v replacement="$STACK_ESCAPED" '{gsub(/%%STACK_CONTENT%%/, replacement)}1' "$TMPFILE" > "${TMPFILE}.2" && mv "${TMPFILE}.2" "$TMPFILE"
else
  sed -i 's/%%STACK_CONTENT%%//' "$TMPFILE"
fi

# Replace %%CONTEXTS_TABLE%%
awk -v replacement="$(echo -e "$CONTEXTS_TABLE")" '{gsub(/%%CONTEXTS_TABLE%%/, replacement)}1' "$TMPFILE" > "${TMPFILE}.2" && mv "${TMPFILE}.2" "$TMPFILE"

# Replace %%DOCS_LIST%%
awk -v replacement="$(echo -e "$DOCS_LIST")" '{gsub(/%%DOCS_LIST%%/, replacement)}1' "$TMPFILE" > "${TMPFILE}.2" && mv "${TMPFILE}.2" "$TMPFILE"

# Replace %%LOCAL_CONTENT%%
if [[ -n "$LOCAL_CONTENT" ]]; then
  LOCAL_ESCAPED="${LOCAL_CONTENT//&/\\\\&}"
  awk -v replacement="$LOCAL_ESCAPED" '{gsub(/%%LOCAL_CONTENT%%/, replacement)}1' "$TMPFILE" > "${TMPFILE}.2" && mv "${TMPFILE}.2" "$TMPFILE"
else
  sed -i 's/%%LOCAL_CONTENT%%//' "$TMPFILE"
fi

# --- Clean up: remove empty sections and excessive blank lines ---

# Use perl for reliable multi-line cleanup
# 1. Remove "---\n\n---" patterns (empty sections between separators)
perl -0777 -i -pe 's/\n---\n\s*\n---\n/\n---\n/g' "$TMPFILE"
# 2. Collapse 3+ consecutive newlines to 2
perl -0777 -i -pe 's/\n{3,}/\n\n/g' "$TMPFILE"
# 3. Remove trailing whitespace/newlines
perl -0777 -i -pe 's/\s+$/\n/' "$TMPFILE"

# --- Write output ---

cp "$TMPFILE" "$OUTPUT"
rm -f "$TMPFILE"

LINES=$(wc -l < "$OUTPUT")
echo -e "${GREEN}Generated${NC} $OUTPUT ${BLUE}(${LINES} lines)${NC}"
