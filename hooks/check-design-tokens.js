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

const fs = require('fs');
const path = require('path');
const { findFlutterConfig } = require('./lib/flutter-config');

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

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

    const tokensConfig = config.designTokens;
    if (!tokensConfig?.enabled) {
      process.stdout.write(data);
      process.exit(0);
    }

    const skipPatterns = config.skipPatterns || ['_test.dart', '.g.dart', '.freezed.dart', '.mock.dart'];
    if (skipPatterns.some((pat) => filePath.endsWith(pat))) {
      process.stdout.write(data);
      process.exit(0);
    }

    const normalized = filePath.replace(/\\/g, '/');

    // Pliki definiujące tokeny — jedyne miejsce, gdzie literał jest poprawny
    const definitionPaths = tokensConfig.definitionPaths || [];
    if (definitionPaths.some((p) => normalized.includes(p))) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Zakres po fragmencie ścieżki, nie po globie — patrz komentarz w
    // check-debugprint-guard.js: matchesPattern() psuje `**` przy zagnieżdżeniu.
    const pathContains = tokensConfig.pathContains || ['/lib/'];
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

    const checks = tokensConfig.checks || {};
    const activeRules = RULES.filter((r) => checks[r.key]);
    // Wyjątki, które są w praktyce nieszkodliwe (np. Colors.transparent)
    const allowed = tokensConfig.allowedColors || ['Colors.transparent'];

    const findings = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (COMMENT_LINE.test(raw)) continue;

      const line = stripTrailingComment(raw);
      if (allowed.some((a) => line.includes(a))) continue;

      for (const rule of activeRules) {
        if (rule.re.test(line)) {
          findings.push({ line: i + 1, msg: rule.msg });
          break; // jedno zgłoszenie na linię wystarczy
        }
      }
    }

    if (findings.length) {
      const shown = findings.slice(0, 10);
      for (const f of shown) {
        console.error(`[Hook] Flutter design: ${basename}:${f.line} — ${f.msg}`);
      }
      if (findings.length > shown.length) {
        console.error(`[Hook] Flutter design: ...i jeszcze ${findings.length - shown.length} w tym pliku`);
      }
      console.error('[Hook] Wzorzec: patterns/flutter/design-token-pattern.md');
    }
  } catch {
    // Nieprawidłowe wejście — przepuść bez zmian
  }

  process.stdout.write(data);
  process.exit(0);
});
