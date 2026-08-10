#!/usr/bin/env node
/**
 * PostToolUse Hook: hardkodowane teksty UI zamiast kluczy lokalizacji
 *
 * DLACZEGO: aplikacja może mieć komplet tłumaczeń w ARB i mimo to być nieprzełączalna
 * na inny język, bo teksty nigdy nie przechodzą przez warstwę lokalizacji. Ten hook
 * łapie taki string w momencie zapisu, kiedy poprawka kosztuje jedną linię — a nie
 * po roku, gdy jest ich tysiąc i nikt się już za to nie zabierze.
 *
 * Implementuje kontrakt zadeklarowany w flutter-hooks.json pod kluczem
 * `l10n.checkHardcodedStrings` — `forbiddenPatterns` to lista wyrażeń regularnych
 * definiowana PRZEZ PROJEKT, nie zaszyta tutaj. Dzięki temu każdy projekt sam
 * decyduje, jak wygląda u niego „tekst dla użytkownika".
 *
 * Opcjonalnie (klucz `domainLayers`) sprawdza dodatkowo, czy tekst w języku
 * naturalnym nie wyciekł do warstwy domenowej. To podwójne naruszenie: łamie
 * lokalizację ORAZ czystość warstw — encja czy typ błędu nie powinny wiedzieć,
 * w jakim języku mówi interfejs.
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

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;
// Literał zawierający znak charakterystyczny dla polszczyzny — sygnał, że to
// tekst dla człowieka, a nie identyfikator techniczny.
const NATURAL_LANGUAGE_LITERAL = /'[^']*[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ][^']*'/;

const MAX_STDIN = 1024 * 1024;
let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) {
    data += chunk.substring(0, MAX_STDIN - data.length);
  }
});

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

    const l10nConfig = config.l10n;
    if (!l10nConfig?.enabled) {
      process.stdout.write(data);
      process.exit(0);
    }

    const check = l10nConfig.checkHardcodedStrings;
    if (!check) {
      process.stdout.write(data);
      process.exit(0);
    }

    const skipPatterns = config.skipPatterns || ['_test.dart', '.g.dart', '.freezed.dart', '.mock.dart'];
    if (skipPatterns.some((pat) => filePath.endsWith(pat))) {
      process.stdout.write(data);
      process.exit(0);
    }

    const normalized = filePath.replace(/\\/g, '/');

    // Katalog samych tłumaczeń jest z natury pełen tekstu — nie sprawdzamy go
    const l10nDirs = check.excludePaths || ['/l10n/', '/generated/'];
    if (l10nDirs.some((p) => normalized.includes(p))) {
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

    // ── Sprawdzenie 1: teksty w warstwie prezentacji (kontrakt z configu) ──
    const uiPatterns = check.filePatterns || ['**/presentation/**/*.dart'];
    const isUiFile = uiPatterns.some((pat) => matchesPattern(normalized, pat));

    const findings = [];

    if (isUiFile) {
      const forbidden = (check.forbiddenPatterns || []).map((p) => {
        try {
          return new RegExp(p);
        } catch {
          return null; // wadliwy regex w configu nie może wywalić hooka
        }
      });

      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (COMMENT_LINE.test(raw)) continue;
        const line = stripTrailingComment(raw);

        if (forbidden.some((re) => re && re.test(line))) {
          findings.push({
            line: i + 1,
            msg: 'tekst dla użytkownika wpisany wprost — przenieś do ARB i użyj klucza lokalizacji',
          });
        }
      }
    }

    // ── Sprawdzenie 2 (opcjonalne): język naturalny w warstwie domenowej ──
    const domainCheck = check.domainLayers;
    if (domainCheck?.enabled) {
      const domainPatterns = domainCheck.filePatterns || ['**/domain/**/*.dart'];
      if (domainPatterns.some((pat) => matchesPattern(normalized, pat))) {
        for (let i = 0; i < lines.length; i++) {
          const raw = lines[i];
          if (COMMENT_LINE.test(raw)) continue;
          const line = stripTrailingComment(raw);

          if (NATURAL_LANGUAGE_LITERAL.test(line)) {
            findings.push({
              line: i + 1,
              msg:
                'tekst w języku naturalnym w warstwie domenowej — domena ma zwracać klucz lub enum, ' +
                'a mapowanie na tekst należy do prezentacji',
            });
          }
        }
      }
    }

    if (findings.length) {
      const shown = findings.slice(0, 10);
      for (const f of shown) {
        console.error(`[Hook] Flutter l10n: ${basename}:${f.line} — ${f.msg}`);
      }
      if (findings.length > shown.length) {
        console.error(`[Hook] Flutter l10n: ...i jeszcze ${findings.length - shown.length} w tym pliku`);
      }
      if (check.allowedImport) {
        console.error(`[Hook] Użyj lokalizacji z: ${check.allowedImport}`);
      }
      console.error('[Hook] Wzorzec: patterns/flutter/localization-pattern.md');
    }
  } catch {
    // Nieprawidłowe wejście — przepuść bez zmian
  }

  process.stdout.write(data);
  process.exit(0);
});
