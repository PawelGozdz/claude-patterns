#!/usr/bin/env node
/**
 * PostToolUse Hook: Detect ref.read() inside build() methods in Flutter/Riverpod
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires flutter-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Flutter projects).
 *
 * Checks:
 * - ref.read() inside build() method — should use ref.watch() for reactivity
 *
 * Detection: finds build( method, tracks brace depth, flags ref.read( within scope.
 * Only checks files matching configurable patterns (e.g. presentation Dart files).
 * Skips generated files.
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const { matchesPattern } = require('./lib/flutter-config');
const { runRuleScanner, COMMENT_LINE_C } = require('./lib/rule-scanner');

const BUILD_METHOD = /\bbuild\s*\(/;
const REF_READ = /\bref\.read\s*\(/;

runRuleScanner({
  extensions: '.dart',
  configFinder: 'flutter',
  section: (config) => (config.riverpod?.checkRefRead?.enabled ? config.riverpod.checkRefRead : null),
  skipStyle: 'flutter',
  scope: ({ normalized, section }) => {
    const filePatterns = section.filePatterns || ['*/presentation/**/*.dart'];
    return filePatterns.some((pat) => matchesPattern(normalized, pat));
  },
  // Własny skaner: `ref.read` jest błędem TYLKO wewnątrz build(), więc trzeba
  // śledzić klamry, a nie pojedynczą linię.
  scan: ({ lines, basename }) => {
    let insideBuild = false;
    let braceDepth = 0;
    let buildStartDepth = 0;

    const warn = (i) => console.error(
      `[Hook] Flutter: ref.read() at line ${i + 1} in ${basename} — use ref.watch() inside build() for reactivity`,
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE_C.test(line)) continue;

      const countBraces = () => {
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
      };

      if (!insideBuild && BUILD_METHOD.test(line)) {
        insideBuild = true;
        buildStartDepth = braceDepth;
        countBraces();
        if (REF_READ.test(line)) warn(i);
        continue;
      }

      if (insideBuild) {
        if (REF_READ.test(line)) warn(i);
        countBraces();
        if (braceDepth <= buildStartDepth) insideBuild = false;
      } else {
        countBraces();
      }
    }
  },
});
