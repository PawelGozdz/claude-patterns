#!/bin/bash
# validate-metadata.sh - Validate METADATA.yml files in patterns repository
#
# Usage: ./validate-metadata.sh
# Run from: ~/.claude-patterns/

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}METADATA Validation Script v1.0${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -d "patterns" ]; then
  echo -e "${RED}❌ Error: patterns/ directory not found${NC}"
  echo "   Run this script from ~/.claude-patterns/"
  exit 1
fi

# Check if Python is available (for YAML validation)
if ! command -v python3 &> /dev/null; then
  echo -e "${RED}❌ Error: python3 not found${NC}"
  echo "   Install Python 3 to validate YAML syntax"
  exit 1
fi

# Check if PyYAML is available
python3 -c "import yaml" 2>/dev/null
if [ $? -ne 0 ]; then
  echo -e "${YELLOW}⚠️  Warning: PyYAML not installed${NC}"
  echo "   Install with: pip install pyyaml"
  echo "   Skipping YAML syntax validation..."
  SKIP_YAML=true
else
  SKIP_YAML=false
fi

echo -e "${YELLOW}Searching for METADATA.yml files...${NC}"
echo ""

# Find all METADATA.yml files
found_count=0
valid_count=0
invalid_count=0

while IFS= read -r -d '' file; do
  found_count=$((found_count + 1))
  echo -e "${BLUE}Validating:${NC} $file"

  # Validate YAML syntax
  if [ "$SKIP_YAML" = false ]; then
    python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>&1
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}  ✅ Valid YAML syntax${NC}"

      # Check for required fields
      required_fields=("version" "layer" "stack_support" "patterns")
      missing_fields=()

      for field in "${required_fields[@]}"; do
        if ! grep -q "^${field}:" "$file"; then
          missing_fields+=("$field")
        fi
      done

      if [ ${#missing_fields[@]} -eq 0 ]; then
        echo -e "${GREEN}  ✅ All required fields present${NC}"
        valid_count=$((valid_count + 1))
      else
        echo -e "${RED}  ❌ Missing fields: ${missing_fields[*]}${NC}"
        invalid_count=$((invalid_count + 1))
      fi
    else
      echo -e "${RED}  ❌ Invalid YAML syntax${NC}"
      invalid_count=$((invalid_count + 1))
    fi
  else
    echo -e "${YELLOW}  ⏭️  Skipped (PyYAML not available)${NC}"
  fi

  echo ""
done < <(find patterns -name "METADATA.yml" -print0)

# Validate root METADATA.yml
if [ -f "METADATA.yml" ]; then
  found_count=$((found_count + 1))
  echo -e "${BLUE}Validating:${NC} METADATA.yml (root)"

  if [ "$SKIP_YAML" = false ]; then
    python3 -c "import yaml; yaml.safe_load(open('METADATA.yml'))" 2>&1
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}  ✅ Valid YAML syntax${NC}"
      valid_count=$((valid_count + 1))
    else
      echo -e "${RED}  ❌ Invalid YAML syntax${NC}"
      invalid_count=$((invalid_count + 1))
    fi
  else
    echo -e "${YELLOW}  ⏭️  Skipped (PyYAML not available)${NC}"
  fi

  echo ""
fi

# Summary
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Validation Summary${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Total files:${NC} $found_count"
if [ "$SKIP_YAML" = false ]; then
  echo -e "${GREEN}Valid:${NC} $valid_count"
  if [ $invalid_count -gt 0 ]; then
    echo -e "${RED}Invalid:${NC} $invalid_count"
  fi
else
  echo -e "${YELLOW}Validation skipped (PyYAML not installed)${NC}"
fi
echo -e "${BLUE}================================${NC}"
echo ""

if [ $invalid_count -gt 0 ]; then
  echo -e "${RED}❌ Validation FAILED${NC}"
  echo "   Fix errors above and re-run validation"
  exit 1
else
  if [ "$SKIP_YAML" = false ]; then
    echo -e "${GREEN}✅ All METADATA.yml files are valid!${NC}"
  else
    echo -e "${YELLOW}⚠️  Validation skipped (install PyYAML for full validation)${NC}"
  fi
  exit 0
fi
