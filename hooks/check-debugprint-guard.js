#!/usr/bin/env node
/**
 * PostToolUse Hook: debugPrint() / print() bez osłony kDebugMode
 *
 * DLACZEGO to jest hook bezpieczeństwa, a nie stylu:
 * debugPrint() NIE jest wycinane z build release. W przeciwieństwie do assert(),
 * które kompilator usuwa w trybie release, debugPrint wykonuje się na telefonach
 * realnych użytkowników i trafia do logu systemowego urządzenia (logcat / Console).
 * Każdy payload, token, e-mail czy treść odpowiedzi błędu przekazane do debugPrint
 * są tam czytelne dla dowolnej aplikacji z dostępem do logów oraz dla każdego,
 * kto podepnie urządzenie do komputera.
 *
 * Poprawny kontrakt: każde wywołanie debugPrint/print musi być osłonięte
 * `if (kDebugMode)` — albo bezpośrednio, albo przez opakowanie w helper,
 * który sam ma taką osłonę.
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
const { findFlutterConfig } = require('./lib/flutter-config');

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;
const KDEBUG = /\bkDebugMode\b/;
const DEBUG_PRINT = /\bdebugPrint\s*\(/;
// `print(` ale nie `debugPrint(`, `sprint(`, `obj.print(`
const BARE_PRINT = /(?<![\w.])print\s*\(/;

const MAX_STDIN = 1024 * 1024;
let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) {
    data += chunk.substring(0, MAX_STDIN - data.length);
  }
});

/** Ucina komentarz liniowy, żeby `// debugPrint(x)` nie liczyło się jako kod. */
function stripTrailingComment(line) {
  const idx = line.indexOf('//');
  return idx >= 0 ? line.slice(0, idx) : line;
}

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath = input.tool_input?.file_path;

    if (!filePath || !filePath.endsWith('.dart')) {
      process.stdout.write(data);
      process.exit(0);
    }

    const loaded = findFlutterConfig(filePath);
    if (!loaded) {
      process.stdout.write(data);
      process.exit(0);
    }

    const { config } = loaded;

    const loggingConfig = config.logging?.checkDebugPrintGuard;
    if (!loggingConfig?.enabled) {
      process.stdout.write(data);
      process.exit(0);
    }

    const skipPatterns = config.skipPatterns || ['_test.dart', '.g.dart', '.freezed.dart', '.mock.dart'];
    if (skipPatterns.some((pat) => filePath.endsWith(pat))) {
      process.stdout.write(data);
      process.exit(0);
    }

    const normalized = filePath.replace(/\\/g, '/');

    // Pliki jawnie zwolnione (np. własny wrapper loggera, który sam osłania kDebugMode)
    const allowList = loggingConfig.allowFiles || [];
    if (allowList.some((pat) => normalized.includes(pat))) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Zakres po fragmencie ścieżki, nie po globie. Powód: matchesPattern() z
    // lib/ddd-config.js psuje `**` przy podstawianiu pojedynczych gwiazdek, przez
    // co `**/lib/**/*.dart` nie łapie plików zagnieżdżonych głębiej niż jeden
    // katalog. Prosty `includes` jest tu przewidywalny i wystarczający.
    const pathContains = loggingConfig.pathContains || ['/lib/'];
    if (!pathContains.some((frag) => normalized.includes(frag))) {
      process.stdout.write(data);
      process.exit(0);
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      process.stdout.write(data);
      process.exit(0);
    }

    const lines = fs.readFileSync(resolvedPath, 'utf8').split('\n');
    const basename = path.basename(filePath);

    // Śledzenie zagnieżdżenia: `guards` trzyma głębokości, na których otwarto blok
    // osłonięty kDebugMode. Wszystko wewnątrz takiego bloku jest bezpieczne.
    let depth = 0;
    const guards = [];
    const findings = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (COMMENT_LINE.test(raw)) continue;

      const line = stripTrailingComment(raw);
      const hasGuardKeyword = KDEBUG.test(line);

      // Osłonięte, jeśli jesteśmy w bloku kDebugMode albo osłona jest w tej samej linii
      // (np. `if (kDebugMode) debugPrint(msg);` albo `kDebugMode ? debugPrint(x) : null`)
      const guarded = guards.length > 0 || hasGuardKeyword;

      if (!guarded) {
        if (DEBUG_PRINT.test(line)) {
          findings.push({ line: i + 1, kind: 'debugPrint' });
        } else if (BARE_PRINT.test(line)) {
          findings.push({ line: i + 1, kind: 'print' });
        }
      }

      const depthBefore = depth;
      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }

      // Linia z kDebugMode otworzyła blok → zapamiętaj poziom, na którym się zamknie
      if (hasGuardKeyword && depth > depthBefore) guards.push(depthBefore);
      while (guards.length && depth <= guards[guards.length - 1]) guards.pop();
    }

    if (findings.length) {
      const shown = findings.slice(0, 10);
      for (const f of shown) {
        console.error(
          `[Hook] Flutter security: ${f.kind}() w linii ${f.line} (${basename}) bez osłony kDebugMode — ` +
            `debugPrint NIE jest wycinane z build release, log trafi na urządzenia użytkowników`,
        );
      }
      if (findings.length > shown.length) {
        console.error(`[Hook] Flutter security: ...i jeszcze ${findings.length - shown.length} w tym pliku`);
      }
      console.error(
        `[Hook] Napraw: owiń w \`if (kDebugMode) { ... }\` albo przenieś do loggera osłoniętego kDebugMode. ` +
          `Wzorzec: patterns/flutter/mobile-security-pattern.md`,
      );
    }
  } catch {
    // Nieprawidłowe wejście — przepuść bez zmian
  }

  process.stdout.write(data);
  process.exit(0);
});
