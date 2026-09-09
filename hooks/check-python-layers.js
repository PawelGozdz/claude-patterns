#!/usr/bin/env node
/**
 * PostToolUse Hook: Check Python domain/service layer purity after editing
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires python-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Python projects).
 *
 * Validates:
 * - No forbidden imports (infra packages) in domain/services layers
 * - Detects Python import syntax: import foo, from foo import bar
 *
 * Skips: test files, conftest, __pycache__, .venv
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const { runRuleScanner, COMMENT_LINE_PY } = require('./lib/rule-scanner');

// Python import patterns
const PY_IMPORT = /^\s*(?:import\s+(\S+)|from\s+(\S+)\s+import)/;

runRuleScanner({
  extensions: '.py',
  configFinder: 'python',
  section: (config) => config.purity || null,
  skipStyle: 'python',
  // Warstwę pliku rozpoznajemy po fragmencie ścieżki `/warstwa/`; plik spoza
  // warstw czystych nie jest w ogóle sprawdzany.
  scope: ({ normalized, section }) =>
    (section.noInfraImportLayers || []).some((layer) => new RegExp(`/${layer}/`).test(normalized)),
  // Własny skaner: reguła dotyczy TOP-LEVEL nazwy pakietu z importu
  // (`sqlalchemy.orm` → `sqlalchemy`), a nie dowolnego trafienia w linii.
  scan: ({ lines, basename, normalized, section: purity }) => {
    const forbiddenImports = purity.forbiddenImports || [];
    if (forbiddenImports.length === 0) return;

    const fileLayer = (purity.noInfraImportLayers || []).find((layer) =>
      new RegExp(`/${layer}/`).test(normalized),
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE_PY.test(line)) continue;

      const importMatch = line.match(PY_IMPORT);
      if (!importMatch) continue;

      const importModule = importMatch[1] || importMatch[2];
      if (!importModule) continue;

      const topPackage = importModule.split('.')[0];
      const forbidden = forbiddenImports.find((f) => topPackage === f);
      if (forbidden) {
        console.error(
          `[Hook] Python: Forbidden import "${forbidden}" at line ${i + 1} in ${basename} — ${fileLayer} layer must not depend on infrastructure`,
        );
      }
    }
  },
});
