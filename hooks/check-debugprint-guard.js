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

const { runRuleScanner, stripTrailingComment, COMMENT_LINE_C } = require('./lib/rule-scanner');

const KDEBUG = /\bkDebugMode\b/;
const DEBUG_PRINT = /\bdebugPrint\s*\(/;
// `print(` ale nie `debugPrint(`, `sprint(`, `obj.print(`
const BARE_PRINT = /(?<![\w.])print\s*\(/;

runRuleScanner({
  extensions: '.dart',
  configFinder: 'flutter',
  section: (config) => (config.logging?.checkDebugPrintGuard?.enabled ? config.logging.checkDebugPrintGuard : null),
  skipStyle: 'flutter',
  scope: ({ normalized, section }) => {
    // Pliki jawnie zwolnione (np. własny wrapper loggera, który sam osłania kDebugMode)
    const allowList = section.allowFiles || [];
    if (allowList.some((pat) => normalized.includes(pat))) return false;
    // Zakres po fragmencie ścieżki, nie po globie. Powód: matchesPattern() z
    // lib/ddd-config.js psuje `**` przy podstawianiu pojedynczych gwiazdek, przez
    // co `**/lib/**/*.dart` nie łapie plików zagnieżdżonych głębiej niż jeden
    // katalog. Prosty `includes` jest tu przewidywalny i wystarczający.
    const pathContains = section.pathContains || ['/lib/'];
    return pathContains.some((frag) => normalized.includes(frag));
  },
  // Własny skaner zamiast `rules`: „osłonięty" zależy od ZAGNIEŻDŻENIA bloków,
  // a nie od treści pojedynczej linii.
  scan: ({ lines, basename }) => {
    // `guards` trzyma głębokości, na których otwarto blok osłonięty kDebugMode.
    // Wszystko wewnątrz takiego bloku jest bezpieczne.
    let depth = 0;
    const guards = [];
    const findings = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      if (COMMENT_LINE_C.test(rawLine)) continue;

      const line = stripTrailingComment(rawLine);
      const hasGuardKeyword = KDEBUG.test(line);

      // Osłonięte, jeśli jesteśmy w bloku kDebugMode albo osłona jest w tej samej linii
      // (np. `if (kDebugMode) debugPrint(msg);` albo `kDebugMode ? debugPrint(x) : null`)
      const guarded = guards.length > 0 || hasGuardKeyword;

      if (!guarded) {
        if (DEBUG_PRINT.test(line)) findings.push({ line: i + 1, kind: 'debugPrint' });
        else if (BARE_PRINT.test(line)) findings.push({ line: i + 1, kind: 'print' });
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
  },
});
