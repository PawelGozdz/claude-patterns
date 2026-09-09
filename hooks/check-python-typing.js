#!/usr/bin/env node
/**
 * PostToolUse Hook: Detect missing type hints in Python functions
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires python-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Python projects).
 *
 * Checks:
 * - Function definitions without return type annotations
 * - Function parameters without type annotations (excluding self, cls)
 *
 * Only checks files matching configurable patterns.
 * Skips test files, conftest, private/dunder methods.
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const { matchesPattern } = require('./lib/python-config');
const { runRuleScanner, COMMENT_LINE_PY } = require('./lib/rule-scanner');

// Match function defs: def foo(params) or def foo(params) -> RetType:
const FUNC_DEF = /^\s*(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/;
const HAS_RETURN_TYPE = /->\s*\S+/;

runRuleScanner({
  extensions: '.py',
  configFinder: 'python',
  section: (config) => (config.typing?.checkUntyped?.enabled ? config.typing.checkUntyped : null),
  skipStyle: 'python',
  scope: ({ normalized, section }) => {
    const filePatterns = section.filePatterns || ['**/*.py'];
    return filePatterns.some((pat) => matchesPattern(normalized, pat));
  },
  // Własny skaner: komunikat niesie NAZWĘ funkcji, a dundery i prywatne helpery
  // są zwolnione — obie rzeczy wymagają grupy z dopasowania, nie samego trafienia.
  scan: ({ lines, basename }) => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE_PY.test(line)) continue;

      const funcMatch = line.match(FUNC_DEF);
      if (!funcMatch) continue;

      const funcName = funcMatch[1];
      if (funcName.startsWith('_')) continue; // dundery i prywatne helpery

      if (!HAS_RETURN_TYPE.test(line)) {
        console.error(
          `[Hook] Python: Function "${funcName}" at line ${i + 1} in ${basename} — missing return type annotation`,
        );
      }
    }
  },
});
