#!/bin/bash
# extract-patterns.sh - Extract generic patterns from LocalHero to global repo
#
# Usage: ./extract-patterns.sh
# Run from: ~/.claude-patterns/

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Pattern Extraction Script v1.0${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Configuration
SOURCE_DIR="$HOME/projects/local-hero-3/.claude/knowledge/patterns"
TARGET_DIR="$HOME/projects/claude-patterns/patterns"

# Verify source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
  echo -e "${RED}❌ Error: Source directory not found: $SOURCE_DIR${NC}"
  echo "   Expected LocalHero patterns at: $SOURCE_DIR"
  exit 1
fi

echo -e "${BLUE}Source:${NC} $SOURCE_DIR"
echo -e "${BLUE}Target:${NC} $TARGET_DIR"
echo ""

# Patterns to extract (13 generic patterns)
# Format: "source_path:maturity:stacks"
GENERIC_PATTERNS=(
  # Domain Layer (6 patterns)
  "domain/aggregate-pattern.md:production:typescript"
  "domain/value-object-pattern.md:production:typescript,python"
  "domain/domain-event-pattern.md:production:typescript,generic"
  "domain/entity-pattern.md:production:typescript"
  "domain/specification-policy-pattern.md:production:typescript,generic"
  "domain/domain-service-pattern.md:production:typescript,generic"

  # Application Layer (4 patterns)
  "application/command-handler-pattern.md:production:typescript"
  "application/query-handler-pattern.md:production:typescript"
  "application/application-service-pattern.md:production:typescript"
  "application/audit-handler-pattern.md:production:typescript"

  # Architecture Layer (3 patterns)
  "architecture/dual-identity-pattern.md:production:typescript,generic"
  "architecture/transactional-pattern.md:production:typescript,generic"
  "architecture/fresh-context-pattern.md:production:generic"
)

# Extract patterns
echo -e "${YELLOW}Extracting patterns...${NC}"
echo ""

extracted_count=0
failed_count=0

for pattern_entry in "${GENERIC_PATTERNS[@]}"; do
  # Parse entry (format: "path:maturity:stacks")
  IFS=':' read -r pattern maturity stacks <<< "$pattern_entry"

  source_file="$SOURCE_DIR/$pattern"
  target_file="$TARGET_DIR/$pattern"

  if [ ! -f "$source_file" ]; then
    echo -e "${RED}❌ NOT FOUND:${NC} $pattern"
    failed_count=$((failed_count + 1))
    continue
  fi

  # Create target directory if needed
  mkdir -p "$(dirname "$target_file")"

  # Copy pattern
  cp "$source_file" "$target_file"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Extracted:${NC} $pattern"
    echo -e "   ${BLUE}Maturity:${NC} $maturity | ${BLUE}Stacks:${NC} $stacks"
    extracted_count=$((extracted_count + 1))
  else
    echo -e "${RED}❌ FAILED:${NC} $pattern"
    failed_count=$((failed_count + 1))
  fi
done

echo ""
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}Extracted:${NC} $extracted_count patterns"
if [ $failed_count -gt 0 ]; then
  echo -e "${RED}Failed:${NC} $failed_count patterns"
fi
echo -e "${BLUE}================================${NC}"
echo ""

# Generate METADATA.yml files for each directory
echo -e "${YELLOW}Generating METADATA.yml files...${NC}"
echo ""

# Domain METADATA.yml
cat > "$TARGET_DIR/domain/METADATA.yml" <<'EOF'
# Domain Layer Patterns - Metadata
version: "1.0"
layer: "domain"
description: "Core domain modeling patterns for DDD/CQRS"

stack_support:
  - typescript
  - python      # Partial support (value objects)
  - generic     # Concepts applicable to all languages

patterns:
  - name: aggregate-pattern.md
    stacks: [typescript]
    maturity: production
    last_verified: 2026-02-05
    description: "Aggregate root with factory methods, event emission, invariants"

  - name: value-object-pattern.md
    stacks: [typescript, python]
    maturity: production
    last_verified: 2026-02-05
    description: "Immutable value objects with validation and reconstruction"

  - name: domain-event-pattern.md
    stacks: [typescript, generic]
    maturity: production
    last_verified: 2026-02-05
    description: "Domain events with correlation IDs and GDPR segregation"

  - name: entity-pattern.md
    stacks: [typescript]
    maturity: production
    last_verified: 2026-02-05
    description: "Entities with identity-based equality and lifecycle"

  - name: specification-policy-pattern.md
    stacks: [typescript, generic]
    maturity: production
    last_verified: 2026-02-05
    description: "PolicyBuilder pattern for business rules"

  - name: domain-service-pattern.md
    stacks: [typescript, generic]
    maturity: production
    last_verified: 2026-02-05
    description: "Domain services for cross-aggregate operations"

notes: |
  Domain patterns are highly transferable across languages.
  TypeScript examples use NestJS + @vytches/ddd library.
  Python examples planned for v1.1 (value objects, specifications).

source: "LocalHero v3 production codebase (1355+ tests)"
EOF

echo -e "${GREEN}✅ Created:${NC} domain/METADATA.yml"

# Application METADATA.yml
cat > "$TARGET_DIR/application/METADATA.yml" <<'EOF'
# Application Layer Patterns - Metadata
version: "1.0"
layer: "application"
description: "CQRS and application orchestration patterns"

stack_support:
  - typescript

patterns:
  - name: command-handler-pattern.md
    stacks: [typescript]
    maturity: production
    last_verified: 2026-02-05
    description: "Command handlers with @CommandHandler auto-discovery (v2.0)"
    version: "2.0"

  - name: query-handler-pattern.md
    stacks: [typescript]
    maturity: production
    last_verified: 2026-02-05
    description: "Query handlers with @QueryHandler auto-discovery (v2.0)"
    version: "2.0"

  - name: application-service-pattern.md
    stacks: [typescript]
    maturity: production
    last_verified: 2026-02-05
    description: "Application services for multi-step workflows and sagas"

  - name: audit-handler-pattern.md
    stacks: [typescript]
    maturity: production
    last_verified: 2026-02-05
    description: "Audit handlers with method-level @EventHandler (v2.0)"
    version: "2.0"

notes: |
  Handler patterns (v2.0) use decorator-based auto-discovery.
  No manual registration in module providers required.
  CQRS patterns follow @vytches/ddd conventions.
  Audit handlers enforce ADR-0027 (GDPR audit logging).

source: "LocalHero v3 production codebase (1355+ tests)"
EOF

echo -e "${GREEN}✅ Created:${NC} application/METADATA.yml"

# Architecture METADATA.yml
cat > "$TARGET_DIR/architecture/METADATA.yml" <<'EOF'
# Architecture Layer Patterns - Metadata
version: "1.0"
layer: "architecture"
description: "Cross-cutting architectural patterns"

stack_support:
  - typescript
  - generic     # Concepts applicable to all languages

patterns:
  - name: dual-identity-pattern.md
    stacks: [typescript, generic]
    maturity: production
    last_verified: 2026-02-05
    description: "Security pattern for userId extraction from RequestContext"

  - name: transactional-pattern.md
    stacks: [typescript, generic]
    maturity: production
    last_verified: 2026-02-05
    description: "Transaction management patterns (Result pattern integration)"

  - name: fresh-context-pattern.md
    stacks: [generic]
    maturity: production
    last_verified: 2026-02-05
    description: "Claude Code context management (lean orchestrator, fresh subagents)"

notes: |
  Architecture patterns are broadly applicable across tech stacks.
  dual-identity-pattern is security-focused (prevent audit spoofing).
  transactional-pattern works with any ORM/database abstraction.
  fresh-context-pattern is Claude Code specific but generic pattern.

source: "LocalHero v3 production codebase + Claude Code best practices"
EOF

echo -e "${GREEN}✅ Created:${NC} architecture/METADATA.yml"

echo ""
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}🎉 Extraction Complete!${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo -e "${GREEN}✅ Extracted:${NC} $extracted_count generic patterns"
echo -e "${GREEN}✅ Created:${NC} 3 METADATA.yml files (domain, application, architecture)"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Validate patterns: ./scripts/validate-metadata.sh"
echo "2. Review extracted files: ls -la patterns/"
echo "3. Commit changes: git add . && git commit -m 'Phase 2: Pattern extraction'"
echo ""

exit 0
