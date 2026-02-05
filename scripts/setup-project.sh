#!/bin/bash
# setup-project.sh - Setup symlinks to global patterns in a project
#
# Usage: ./setup-project.sh /path/to/project
# Run from: anywhere

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Project Symlink Setup v1.0${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Parse arguments
PROJECT_DIR="${1:-.}"  # Default to current directory if not provided
GLOBAL_PATTERNS="$HOME/projects/claude-patterns/patterns"

# Resolve absolute path
PROJECT_DIR=$(cd "$PROJECT_DIR" && pwd)

echo -e "${BLUE}Project:${NC} $PROJECT_DIR"
echo -e "${BLUE}Global patterns:${NC} $GLOBAL_PATTERNS"
echo ""

# Validate project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "${RED}❌ Error: Project directory not found: $PROJECT_DIR${NC}"
  exit 1
fi

# Validate global patterns exist
if [ ! -d "$GLOBAL_PATTERNS" ]; then
  echo -e "${RED}❌ Error: Global patterns not found: $GLOBAL_PATTERNS${NC}"
  echo "   Run extract-patterns.sh first to create global patterns"
  exit 1
fi

# Create .claude/knowledge structure if it doesn't exist
KNOWLEDGE_DIR="$PROJECT_DIR/.claude/knowledge"
mkdir -p "$KNOWLEDGE_DIR"
echo -e "${GREEN}✅ Created:${NC} .claude/knowledge/"

# Create patterns-local directory for project-specific overrides
PATTERNS_LOCAL_DIR="$KNOWLEDGE_DIR/patterns-local"
mkdir -p "$PATTERNS_LOCAL_DIR"
echo -e "${GREEN}✅ Created:${NC} .claude/knowledge/patterns-local/"

# Check if patterns symlink already exists
PATTERNS_LINK="$KNOWLEDGE_DIR/patterns"

if [ -L "$PATTERNS_LINK" ]; then
  # It's a symlink - check where it points
  CURRENT_TARGET=$(readlink "$PATTERNS_LINK")
  if [ "$CURRENT_TARGET" = "$GLOBAL_PATTERNS" ]; then
    echo -e "${YELLOW}⚠️  Symlink already exists and points to correct location${NC}"
    echo -e "   ${PATTERNS_LINK} → ${CURRENT_TARGET}"
    SYMLINK_CREATED=false
  else
    echo -e "${YELLOW}⚠️  Symlink exists but points to different location${NC}"
    echo -e "   Current: ${PATTERNS_LINK} → ${CURRENT_TARGET}"
    echo -e "   Expected: ${PATTERNS_LINK} → ${GLOBAL_PATTERNS}"
    read -p "   Replace symlink? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      rm "$PATTERNS_LINK"
      ln -sf "$GLOBAL_PATTERNS" "$PATTERNS_LINK"
      echo -e "${GREEN}✅ Updated symlink${NC}"
      SYMLINK_CREATED=true
    else
      echo -e "${YELLOW}⏭️  Skipped symlink update${NC}"
      SYMLINK_CREATED=false
    fi
  fi
elif [ -d "$PATTERNS_LINK" ]; then
  # It's a real directory
  echo -e "${YELLOW}⚠️  patterns/ is a real directory (not a symlink)${NC}"
  echo -e "   ${PATTERNS_LINK} exists as directory"
  read -p "   Backup and replace with symlink? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    BACKUP_DIR="${PATTERNS_LINK}.backup.$(date +%Y%m%d-%H%M%S)"
    mv "$PATTERNS_LINK" "$BACKUP_DIR"
    echo -e "${GREEN}✅ Backed up to:${NC} $BACKUP_DIR"
    ln -sf "$GLOBAL_PATTERNS" "$PATTERNS_LINK"
    echo -e "${GREEN}✅ Created symlink${NC}"
    SYMLINK_CREATED=true
  else
    echo -e "${YELLOW}⏭️  Skipped symlink creation${NC}"
    SYMLINK_CREATED=false
  fi
elif [ -e "$PATTERNS_LINK" ]; then
  # It's some other file type
  echo -e "${RED}❌ Error: patterns/ exists but is not a directory or symlink${NC}"
  exit 1
else
  # Doesn't exist - create symlink
  ln -sf "$GLOBAL_PATTERNS" "$PATTERNS_LINK"
  echo -e "${GREEN}✅ Created symlink:${NC} patterns/ → $GLOBAL_PATTERNS"
  SYMLINK_CREATED=true
fi

# Create patterns-local/README.md if it doesn't exist
PATTERNS_LOCAL_README="$PATTERNS_LOCAL_DIR/README.md"

if [ ! -f "$PATTERNS_LOCAL_README" ]; then
  cat > "$PATTERNS_LOCAL_README" <<'EOF'
# Project-Specific Pattern Overrides

This directory contains patterns that override global patterns from `~/.claude-patterns/`.

## Pattern Precedence

When Claude Code loads patterns, it uses this precedence:

1. **Local patterns** (this directory) - **Highest priority**
2. **Symlinked global patterns** (`.claude/knowledge/patterns/`)
3. **Claude Code defaults** - Fallback

## When to Add Local Overrides

Add patterns here when:
- ✅ Project has unique requirements (e.g., different ORM, framework)
- ✅ Need to extend/customize generic pattern
- ✅ Temporary experimental patterns (before upstreaming to global repo)
- ✅ Project-specific anti-patterns or gotchas

**Example**: Your project uses Prisma instead of Kysely:
```
patterns-local/
└── infrastructure/
    └── repository-pattern.md  # Prisma-specific override
```

## Upstreaming Patterns

If your local pattern becomes mature and could benefit other projects:

1. Review pattern for generic applicability
2. Remove project-specific references
3. Add to `~/.claude-patterns/patterns/`
4. Update METADATA.yml with stack tags
5. Delete local override (will use global version)

## DO NOT Add Here

❌ Project-specific learnings → Use `.claude/knowledge/learned/` instead
❌ Task files or progress tracking → Use `project-orchestration/` instead
❌ Temporary notes or scratchpad → Use `.claude/scratchpad/` instead

## Pattern Structure

Keep the same directory structure as global patterns:
```
patterns-local/
├── domain/
│   └── custom-aggregate.md
├── application/
│   └── custom-handler.md
└── infrastructure/
    └── custom-repository.md
```

## Example: Local Override

**Scenario**: Your project uses a different authentication library.

**File**: `patterns-local/architecture/dual-identity-pattern.md`

```markdown
# Dual Identity Pattern (Project-Specific Override)

**Override Reason**: This project uses Passport.js instead of NestJS @CurrentUser.

## Differences from Global Pattern

- Uses `req.user` from Passport.js
- JWT tokens stored in cookies (not Authorization header)
- User context extracted in AuthGuard

... (rest of pattern)
```

---

**Last Updated**: $(date +%Y-%m-%d)
**Project**: $(basename "$PROJECT_DIR")
EOF

  echo -e "${GREEN}✅ Created:${NC} patterns-local/README.md"
else
  echo -e "${YELLOW}⚠️  patterns-local/README.md already exists (skipped)${NC}"
fi

# Verify symlink
echo ""
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Verification${NC}"
echo -e "${BLUE}================================${NC}"

if [ -L "$PATTERNS_LINK" ]; then
  LINK_TARGET=$(readlink "$PATTERNS_LINK")
  echo -e "${GREEN}✅ Symlink created:${NC}"
  echo -e "   $PATTERNS_LINK"
  echo -e "   ${BLUE}→${NC} $LINK_TARGET"

  # Count patterns accessible via symlink
  PATTERN_COUNT=$(find "$PATTERNS_LINK" -name "*.md" -not -name "README.md" -not -name "METADATA.yml" | wc -l)
  echo -e "${GREEN}✅ Accessible patterns:${NC} $PATTERN_COUNT"

  # Show layer breakdown
  echo -e "${BLUE}Layers:${NC}"
  for layer in domain application architecture; do
    if [ -d "$PATTERNS_LINK/$layer" ]; then
      layer_count=$(find "$PATTERNS_LINK/$layer" -name "*.md" -not -name "METADATA.yml" | wc -l)
      echo -e "   - $layer: $layer_count patterns"
    fi
  done
else
  echo -e "${RED}❌ Symlink verification failed${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

if [ "$SYMLINK_CREATED" = true ]; then
  echo -e "${YELLOW}Next steps:${NC}"
  echo "1. Test project: run tests to verify patterns work"
  echo "2. Add local overrides: edit patterns-local/ if needed"
  echo "3. Commit changes: git add .claude/ && git commit -m 'Setup global patterns symlink'"
else
  echo -e "${YELLOW}Note:${NC} Symlink already existed, no changes made"
fi
echo ""

exit 0
