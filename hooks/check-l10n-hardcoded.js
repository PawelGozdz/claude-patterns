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

const { matchesPattern } = require('./lib/flutter-config');
const { runRuleScanner, reportFindings, stripTrailingComment, COMMENT_LINE_C } = require('./lib/rule-scanner');

// Literał zawierający znak charakterystyczny dla polszczyzny — sygnał, że to
// tekst dla człowieka, a nie identyfikator techniczny.
const NATURAL_LANGUAGE_LITERAL = /'[^']*[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ][^']*'/;

runRuleScanner({
  extensions: '.dart',
  configFinder: 'flutter',
  section: (config) => (config.l10n?.enabled && config.l10n.checkHardcodedStrings ? config.l10n.checkHardcodedStrings : null),
  skipStyle: 'flutter',
  scope: ({ normalized, section }) => {
    // Katalog samych tłumaczeń jest z natury pełen tekstu — nie sprawdzamy go
    const excluded = section.excludePaths || ['/l10n/', '/generated/'];
    return !excluded.some((p) => normalized.includes(p));
  },
  // Własny skaner: dwa różne zestawy reguł na dwóch różnych zakresach ścieżek
  // (prezentacja vs domena), a jedna lista `findings` na wspólny raport.
  scan: ({ lines, basename, normalized, section: check }) => {
    const findings = [];

    // ── Sprawdzenie 1: teksty w warstwie prezentacji (kontrakt z configu) ──
    const uiPatterns = check.filePatterns || ['**/presentation/**/*.dart'];
    if (uiPatterns.some((pat) => matchesPattern(normalized, pat))) {
      const forbidden = (check.forbiddenPatterns || []).map((p) => {
        try {
          return new RegExp(p);
        } catch {
          return null; // wadliwy regex w configu nie może wywalić hooka
        }
      });

      for (let i = 0; i < lines.length; i++) {
        if (COMMENT_LINE_C.test(lines[i])) continue;
        const line = stripTrailingComment(lines[i]);
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
          if (COMMENT_LINE_C.test(lines[i])) continue;
          const line = stripTrailingComment(lines[i]);
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

    reportFindings(findings, {
      prefix: '[Hook] Flutter l10n:',
      basename,
      footers: [
        check.allowedImport ? `[Hook] Użyj lokalizacji z: ${check.allowedImport}` : null,
        '[Hook] Wzorzec: patterns/flutter/localization-pattern.md',
      ],
    });
  },
});
