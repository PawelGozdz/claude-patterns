#!/bin/bash
# generate-claude-md.sh - Generate CLAUDE.md from composable templates + project.yml
# Pure bash, zero external dependencies (no yq/python needed)
#
# Template composition: core.md + stacks/{stack_profile}.md + CLAUDE-LOCAL.md
# Adding new stack: create templates/stacks/{name}.md - zero generator changes needed
#
# Usage: ./generate-claude-md.sh [project-path]
# Default: current directory

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PATTERNS_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$PATTERNS_DIR/templates"
CORE_TEMPLATE="$TEMPLATES_DIR/core.md"

PROJECT_DIR="${1:-.}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
CONFIG_DIR="$PROJECT_DIR/.claude/config"
PROJECT_YML="$CONFIG_DIR/project.yml"
LOCAL_MD="$CONFIG_DIR/CLAUDE-LOCAL.md"
OUTPUT="$PROJECT_DIR/CLAUDE.md"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# --- Helpers ---

# Extract a simple scalar value from YAML (flat keys only)
# Usage: yml_get "project.name"
yml_get() {
  local key="$1"
  local section="${key%%.*}"
  local field="${key#*.}"

  if [[ "$section" == "$field" ]]; then
    # Top-level key
    grep "^${key}:" "$PROJECT_YML" | head -1 | sed 's/^[^:]*: *//' | sed 's/^"//' | sed 's/"$//'
  else
    # Nested key: find section, then field within indented block
    sed -n "/^${section}:/,/^[a-z]/p" "$PROJECT_YML" | grep "^  ${field}:" | head -1 | sed 's/^[^:]*: *//' | sed 's/^"//' | sed 's/"$//'
  fi
}

# Extract list items (lines starting with "  - " under a section)
yml_list() {
  local section="$1"
  sed -n "/^${section}:/,/^[a-z]/p" "$PROJECT_YML" | grep '^  - ' | sed 's/^  - //' | sed 's/^"//' | sed 's/"$//'
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

CONTEXTS_TABLE="| Context | Status | Tests | Notes |\n|---------|--------|-------|-------|\n"
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
        CONTEXTS_TABLE="${CONTEXTS_TABLE}| ${ctx_name} | ${ctx_status} | ${ctx_tests} | ${ctx_notes} |\n"
        ctx_name=""
      fi
      break
    fi
    if [[ "$line" =~ ^"  - name: " ]]; then
      if [[ -n "$ctx_name" ]]; then
        CONTEXTS_TABLE="${CONTEXTS_TABLE}| ${ctx_name} | ${ctx_status} | ${ctx_tests} | ${ctx_notes} |\n"
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
  CONTEXTS_TABLE="${CONTEXTS_TABLE}| ${ctx_name} | ${ctx_status} | ${ctx_tests} | ${ctx_notes} |\n"
fi

# --- Generate docs list ---

DOCS_LIST=""
while IFS= read -r doc; do
  DOCS_LIST="${DOCS_LIST}- [${doc}](./${doc})\n"
done < <(yml_list "docs")

# --- Generate rules reference ---

PROJECT_LANGUAGE=$(yml_get "project.language")
RULES_REFERENCE=""

if [[ -n "$PROJECT_LANGUAGE" ]]; then
  # Build list of rule files for common and language-specific
  COMMON_RULES_DIR="$PATTERNS_DIR/rules/common"
  LANG_RULES_DIR="$PATTERNS_DIR/rules/$PROJECT_LANGUAGE"

  COMMON_RULES_LIST=""
  if [[ -d "$COMMON_RULES_DIR" ]]; then
    for f in "$COMMON_RULES_DIR"/*.md; do
      [[ -f "$f" ]] || continue
      name=$(basename "$f" .md)
      COMMON_RULES_LIST="${COMMON_RULES_LIST}${name}, "
    done
    COMMON_RULES_LIST="${COMMON_RULES_LIST%, }"  # trim trailing comma
  fi

  LANG_RULES_LIST=""
  if [[ -d "$LANG_RULES_DIR" ]]; then
    for f in "$LANG_RULES_DIR"/*.md; do
      [[ -f "$f" ]] || continue
      name=$(basename "$f" .md)
      LANG_RULES_LIST="${LANG_RULES_LIST}${name}, "
    done
    LANG_RULES_LIST="${LANG_RULES_LIST%, }"
  fi

  RULES_REFERENCE="## Coding Standards & Rules\n\n"
  RULES_REFERENCE="${RULES_REFERENCE}Follow coding standards in \`.claude/knowledge/rules/\`:\n"
  if [[ -n "$COMMON_RULES_LIST" ]]; then
    RULES_REFERENCE="${RULES_REFERENCE}- Common: \`.claude/knowledge/rules/common/\` (${COMMON_RULES_LIST})\n"
  fi
  if [[ -n "$LANG_RULES_LIST" ]]; then
    display_lang=$(echo "$PROJECT_LANGUAGE" | sed 's/\b\(.\)/\u\1/g')
    RULES_REFERENCE="${RULES_REFERENCE}- ${display_lang}: \`.claude/knowledge/rules/${PROJECT_LANGUAGE}/\` (${LANG_RULES_LIST})\n"
  fi
  RULES_REFERENCE="${RULES_REFERENCE}\nRead relevant rule files before implementing."
fi

# --- Generate skills reference ---

SKILLS_LIST_ITEMS=""
while IFS= read -r category; do
  [[ -z "$category" ]] && continue
  CATEGORY_DIR="$PATTERNS_DIR/skills/$category"
  if [[ -d "$CATEGORY_DIR" ]]; then
    for skill_dir in "$CATEGORY_DIR"/*/; do
      [[ -d "$skill_dir" ]] || continue
      skill_name=$(basename "$skill_dir")
      # Try to extract description from first line of SKILL.md
      skill_desc=""
      if [[ -f "$skill_dir/SKILL.md" ]]; then
        skill_desc=$(head -5 "$skill_dir/SKILL.md" | grep -i "description:" | head -1 | sed 's/^.*description: *//' | sed 's/^"//' | sed 's/"$//')
        if [[ -z "$skill_desc" ]]; then
          # Fallback: use the title (first # heading)
          skill_desc=$(grep "^# " "$skill_dir/SKILL.md" | head -1 | sed 's/^# //')
        fi
      fi
      if [[ -n "$skill_desc" ]]; then
        SKILLS_LIST_ITEMS="${SKILLS_LIST_ITEMS}- ${category}/${skill_name} — ${skill_desc}\n"
      else
        SKILLS_LIST_ITEMS="${SKILLS_LIST_ITEMS}- ${category}/${skill_name}\n"
      fi
    done
  fi
done < <(yml_list "skills")

SKILLS_REFERENCE=""
if [[ -n "$SKILLS_LIST_ITEMS" ]]; then
  SKILLS_REFERENCE="## Available Skills\n\n"
  SKILLS_REFERENCE="${SKILLS_REFERENCE}Reference skills in \`.claude/knowledge/skills/\`:\n"
  SKILLS_REFERENCE="${SKILLS_REFERENCE}${SKILLS_LIST_ITEMS}"
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
fi

# --- Compose template: core + stack profile ---

CONTENT=$(cat "$CORE_TEMPLATE")

# --- Replace simple markers ---

CONTENT="${CONTENT//%%TIMESTAMP%%/$TIMESTAMP}"
CONTENT="${CONTENT//%%PROJECT_NAME%%/$PROJECT_NAME}"
CONTENT="${CONTENT//%%PROJECT_DESCRIPTION%%/$PROJECT_DESC}"
CONTENT="${CONTENT//%%STACK%%/$STACK}"
CONTENT="${CONTENT//%%TESTING%%/$TESTING}"
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

# Replace %%RULES_REFERENCE%% (using perl to avoid awk & backreference issues)
if [[ -n "$RULES_REFERENCE" ]]; then
  export MARKER_REPLACEMENT="$(echo -e "$RULES_REFERENCE")"
  perl -0777 -i -pe 's/%%RULES_REFERENCE%%/$ENV{MARKER_REPLACEMENT}/g' "$TMPFILE"
else
  sed -i 's/%%RULES_REFERENCE%%//' "$TMPFILE"
fi

# Replace %%SKILLS_REFERENCE%% (using perl to avoid awk & backreference issues)
if [[ -n "$SKILLS_REFERENCE" ]]; then
  export MARKER_REPLACEMENT="$(echo -e "$SKILLS_REFERENCE")"
  perl -0777 -i -pe 's/%%SKILLS_REFERENCE%%/$ENV{MARKER_REPLACEMENT}/g' "$TMPFILE"
else
  sed -i 's/%%SKILLS_REFERENCE%%//' "$TMPFILE"
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
  awk -v replacement="$STACK_CONTENT" '{gsub(/%%STACK_CONTENT%%/, replacement)}1' "$TMPFILE" > "${TMPFILE}.2" && mv "${TMPFILE}.2" "$TMPFILE"
else
  sed -i 's/%%STACK_CONTENT%%//' "$TMPFILE"
fi

# Replace %%CONTEXTS_TABLE%%
awk -v replacement="$(echo -e "$CONTEXTS_TABLE")" '{gsub(/%%CONTEXTS_TABLE%%/, replacement)}1' "$TMPFILE" > "${TMPFILE}.2" && mv "${TMPFILE}.2" "$TMPFILE"

# Replace %%DOCS_LIST%%
awk -v replacement="$(echo -e "$DOCS_LIST")" '{gsub(/%%DOCS_LIST%%/, replacement)}1' "$TMPFILE" > "${TMPFILE}.2" && mv "${TMPFILE}.2" "$TMPFILE"

# Replace %%LOCAL_CONTENT%%
if [[ -n "$LOCAL_CONTENT" ]]; then
  awk -v replacement="$LOCAL_CONTENT" '{gsub(/%%LOCAL_CONTENT%%/, replacement)}1' "$TMPFILE" > "${TMPFILE}.2" && mv "${TMPFILE}.2" "$TMPFILE"
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
