#!/usr/bin/env node
/**
 * PostToolUse Hook: Warn on bare pumpAndSettle() (no Duration) in Flutter test files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires flutter-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Flutter projects).
 *
 * Context (juz-ide-mobile-app TD-014): a bare `await tester.pumpAndSettle();` on a
 * widget with a continuously-animating/loading element can hang indefinitely,
 * ballooning a single `flutter_tester` process to tens of GB RSS and freezing a
 * shared host. `dart/testing.md` already warns against this pattern; this hook
 * catches new occurrences at edit time instead of relying on someone noticing.
 *
 * Checks:
 * - Bare `pumpAndSettle()` call (no argument) anywhere in a `_test.dart` file
 *
 * Always warns only (exit 0) — never blocks the agent. Some widgets genuinely
 * have no animation and a bare call is harmless, so this is advisory.
 */

const { runRuleScanner, COMMENT_LINE_C } = require('./lib/rule-scanner');

const BARE_PUMP_AND_SETTLE = /\.pumpAndSettle\(\s*\)/;

runRuleScanner({
  extensions: '_test.dart',
  configFinder: 'flutter',
  section: (config) => (config.pumpAndSettle?.checkBareCall?.enabled ? config.pumpAndSettle.checkBareCall : null),
  // Własny skaner zamiast `rules`: komunikat ma historyczny format
  // „at line N in <plik>", inny niż wspólny `<plik>:N —` z reportFindings.
  // Zmiana brzmienia zerwałaby dopasowania w cudzych filtrach logów.
  scan: ({ lines, basename }) => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE_C.test(line)) continue;
      if (BARE_PUMP_AND_SETTLE.test(line)) {
        console.error(
          `[Hook] Flutter: bare pumpAndSettle() at line ${i + 1} in ${basename} — ` +
            `if this widget has any continuous animation/loading state, this can hang the ` +
            `test process indefinitely. Prefer pumpAndSettle(const Duration(seconds: 5)) ` +
            `or pump(duration) for known-infinite animations (see dart/testing.md).`,
        );
      }
    }
  },
});
