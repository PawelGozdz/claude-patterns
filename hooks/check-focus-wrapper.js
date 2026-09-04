#!/usr/bin/env node
/**
 * PostToolUse Hook: gołe `GestureDetector` bez obsługi klawiatury/focus ringa
 *
 * DLACZEGO: audyt a11y 2026-08-27 (UX-POLISH-001-FOLLOWUPS-022) znalazł tylko ~6 plików
 * w całej apce używających `Focus()` — ekrany dodane po ~06-2026 systemowo nie mają
 * focus ringa (WCAG SC 2.4.7). `.claude/rules/dart/design-system.md` "Interactive states"
 * wymaga widocznego focus indicatora na każdym tappable, ale nic tego nie egzekwowało —
 * dług rósł przy każdym nowym ekranie. Ten hook łapie to w momencie zapisu.
 *
 * Detekcja: plik ma gołe `GestureDetector(` (interakcja bez wbudowanej obsługi
 * klawiatury), a NIGDZIE w pliku nie ma żadnego z: `Focus(`, `FocusableActionDetector(`,
 * `SoftPressable(` (kanoniczny wrapper z lib/core/motion/ — ma Focus() wbudowane), ani
 * Material tap-widgetu z natywną obsługą focusa (`InkWell(`, `InkResponse(`,
 * `ElevatedButton(`, `TextButton(`, `OutlinedButton(`, `IconButton(`, `FilledButton(`).
 *
 * Nie łapie: pliki używające WYŁĄCZNIE tych "bezpiecznych" widgetów (Material zarządza
 * focusem samo). Nie sprawdza czy wrapper faktycznie OTACZA konkretny GestureDetector —
 * to heurystyka całego pliku, nie AST — tak samo uproszczone jak pozostałe hooki tej
 * rodziny (check-riverpod-patterns.js, check-l10n-hardcoded.js).
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: wymaga flutter-hooks.json w katalogu projektu lub .claude/.
 * Brak configu = brak sprawdzeń (ciche pominięcie w projektach nie-Flutterowych).
 *
 * Zawsze tylko ostrzega (exit 0) — nigdy nie blokuje agenta.
 */

const fs = require('fs');
const path = require('path');
const { findFlutterConfig, matchesPattern } = require('./lib/flutter-config');
const { readStdinJsonWithRaw } = require('./lib/utils');

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;
const GESTURE_DETECTOR = /\bGestureDetector\s*\(/;

const DEFAULT_SAFE_INDICATORS = [
  'Focus(',
  'FocusableActionDetector(',
  'SoftPressable(',
  'InkWell(',
  'InkResponse(',
  'ElevatedButton(',
  'TextButton(',
  'OutlinedButton(',
  'IconButton(',
  'FilledButton(',
];

async function main() {
  const { raw, parsed: input } = await readStdinJsonWithRaw();

  try {
    const filePath = input.tool_input?.file_path;

    if (!filePath || !filePath.endsWith('.dart')) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const loaded = findFlutterConfig(filePath);
    if (!loaded) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const { config } = loaded;

    const focusConfig = config.interactiveFocus;
    if (!focusConfig?.enabled) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const skipPatterns = config.skipPatterns || ['_test.dart', '.g.dart', '.freezed.dart', '.mock.dart'];
    if (skipPatterns.some((pat) => filePath.endsWith(pat))) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const normalized = filePath.replace(/\\/g, '/');
    const filePatterns = focusConfig.filePatterns || ['**/presentation/**/*.dart'];
    const matchesFile = filePatterns.some((pat) => matchesPattern(normalized, pat));

    if (!matchesFile) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    const lines = content.split('\n');
    const basename = path.basename(filePath);

    const safeIndicators = focusConfig.safeIndicators || DEFAULT_SAFE_INDICATORS;
    const hasSafeIndicator = safeIndicators.some((ind) => content.includes(ind));

    if (hasSafeIndicator) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const findings = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE.test(line)) continue;
      if (GESTURE_DETECTOR.test(line)) {
        findings.push(i + 1);
      }
    }

    if (findings.length) {
      const shown = findings.slice(0, 10);
      for (const lineNo of shown) {
        console.error(
          `[Hook] Flutter a11y: GestureDetector at ${basename}:${lineNo} — brak Focus()/SoftPressable/FocusableActionDetector w tym pliku, WCAG SC 2.4.7 (focus ring) nie jest spełnione`,
        );
      }
      if (findings.length > shown.length) {
        console.error(`[Hook] Flutter a11y: ...i jeszcze ${findings.length - shown.length} w tym pliku`);
      }
      console.error('[Hook] Użyj SoftPressable z lib/core/motion/ (ma Focus() wbudowane) zamiast gołego GestureDetector.');
      console.error('[Hook] Wzorzec: .claude/rules/dart/design-system.md "Interactive states"');
    }
  } catch {
    // Nieprawidłowe wejście — przepuść bez zmian
  }

  process.stdout.write(raw);
  process.exit(0);
}

main();
