#!/usr/bin/env node
/**
 * PostToolUse Hook: literały wizualne zamiast tokenów designu
 *
 * DLACZEGO: system designu rozjeżdża się nie przez jedną wielką zmianę, tylko przez
 * pojedyncze „tylko na chwilę" literały wsiąkające w widgety. Każdy z osobna przechodzi
 * review, bo w swoim pliku wygląda niewinnie. Dopiero po miesiącach widać, że aplikacja
 * ma trzy odcienie tła i dwa kroje pisma. Ten hook łapie dryf w momencie powstania.
 *
 * Sprawdza (konfigurowalne):
 *  - colorLiterals      — `Color(0xFF...)` poza plikami definiującymi tokeny
 *  - materialColors     — `Colors.red` itp. zamiast tokena semantycznego
 *  - materialIcons      — `Icons.*` zamiast `AppIcons.*` (ikona to też token)
 *  - hardShadows        — `blurRadius: 0` (twardy cień) tam, gdzie marka wymaga miękkiego
 *
 * PODZIAŁ PRACY z check-typography-tokens.js — ten hook NIE sprawdza typografii
 * ani spacingu. `TextStyle(fontSize:)` i `EdgeInsets.*(literał)` obsługuje
 * check-typography-tokens.js (klucz `tokens.checkInlineStyles`), i robi to lepiej:
 * śledzi bloki nawiasów wieloliniowo. Tutaj są wyłącznie wymiary, których tamten
 * nie dotyka: kolor, ikona, cień. Nie dubluj reguł między tymi dwoma plikami —
 * podwójne ostrzeżenie na tej samej linii to szum, przez który ludzie wyłączają hooki.
 *
 * Pliki definiujące tokeny (config `definitionPaths`) są z natury zwolnione — to
 * jedyne miejsce, gdzie literał jest poprawny.
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: wymaga flutter-hooks.json w katalogu projektu lub .claude/.
 * Brak configu = brak sprawdzeń (ciche pominięcie w projektach nie-Flutterowych).
 *
 * Zawsze tylko ostrzega (exit 0) — nigdy nie blokuje agenta.
 */

const { runRuleScanner } = require('./lib/rule-scanner');

const RULES = [
  {
    key: 'colorLiterals',
    re: /\bColor\(\s*0x[0-9a-fA-F]{6,8}\s*\)/,
    msg: 'literał koloru Color(0x...) — użyj tokena z warstwy design tokens',
  },
  {
    key: 'materialColors',
    re: /\bColors\.[a-zA-Z]\w*/,
    msg: 'kolor z palety Material (Colors.*) — użyj tokena semantycznego marki',
  },
  {
    key: 'materialIcons',
    re: /\bIcons\.[a-zA-Z]\w*/,
    msg: 'ikona z zestawu Material (Icons.*) — użyj AppIcons.* (ikona to też token)',
  },
  {
    key: 'hardShadows',
    re: /\bblurRadius\s*:\s*0\b/,
    msg: 'twardy cień (blurRadius: 0) — marka wymaga miękkiego kierunku światła',
  },
];

runRuleScanner({
  extensions: '.dart',
  configFinder: 'flutter',
  section: (config) => (config.designTokens?.enabled ? config.designTokens : null),
  skipStyle: 'flutter',
  scope: ({ normalized, section }) => {
    // Pliki definiujące tokeny — jedyne miejsce, gdzie literał jest poprawny
    const definitionPaths = section.definitionPaths || [];
    if (definitionPaths.some((path) => normalized.includes(path))) return false;
    // Zakres po fragmencie ścieżki, nie po globie — patrz komentarz w
    // check-debugprint-guard.js: matchesPattern() psuje `**` przy zagnieżdżeniu.
    const pathContains = section.pathContains || ['/lib/'];
    return pathContains.some((frag) => normalized.includes(frag));
  },
  rules: RULES,
  ruleFilter: (section) => section.checks || {},
  allow: ({ section }) => section.allowedColors || ['Colors.transparent'],
  stripComments: true,
  report: {
    prefix: '[Hook] Flutter design:',
    footers: ['[Hook] Wzorzec: patterns/flutter/design-token-pattern.md'],
  },
});
