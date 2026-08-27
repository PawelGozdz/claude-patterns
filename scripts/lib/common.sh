#!/bin/bash
# common.sh - Shared ANSI color codes for claude-patterns shell scripts (K41, TASK-KAIZEN-001)
#
# Was duplicated verbatim (identical escape codes) across 11+ scripts. Source this
# instead of redefining the block. Superset of every variant seen — a script that
# only used a subset of these names is unaffected by the extras.
#
# Usage (from a script in scripts/):
#   source "$SCRIPT_DIR/lib/common.sh"
# Usage (from a script outside scripts/, e.g. hooks/):
#   source "$SCRIPT_DIR/../scripts/lib/common.sh"   # SCRIPT_DIR must be resolved with `cd -P`

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color
