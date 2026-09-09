/**
 * hooks/lib/rule-scanner.js — wspólny szkielet hooków treściowych (K104, TASK-KAIZEN-002).
 *
 * DLACZEGO: dziewięć hooków miało IDENTYCZNY wstęp — czytaj stdin, weź `file_path`,
 * odsiej po rozszerzeniu, znajdź config projektu, sprawdź czy sekcja włączona,
 * odsiej po `skipPatterns`, zawęź po ścieżce, wczytaj plik, przelatuj linie regexem,
 * wypisz ostrzeżenia na stderr, ZAWSZE exit 0 — i różniły się dopiero w środku pętli.
 * Każda kopia miała własne drobne odchylenie (raz `endsWith`, raz `includes`, raz
 * bez `stripTrailingComment`), więc poprawka bezpieczeństwa w jednym hooku nie
 * docierała do ośmiu pozostałych. To jest ta klasa błędu, którą audyt 2026-09-07
 * opisał przy parserze `project.yml` (A8): rozjazd, nie awaria.
 *
 * KONTRAKT ZACHOWANIA — bez zmian względem kopii, które ten moduł zastąpił:
 *   • stdin przechodzi na stdout NIETKNIĘTY (`raw`), także przy błędzie
 *   • wyjście ZAWSZE 0 — te hooki doradzają, nigdy nie blokują agenta
 *   • brak configu projektu = całkowita cisza (nie-Flutterowy/nie-Pythonowy projekt
 *     nie może dostawać ostrzeżeń o Riverpodzie)
 *
 * CZEGO TU NIE MA — świadomie:
 *   • `check-focus-wrapper` — jego warunek („brak wrappera GDZIEKOLWIEK w pliku")
 *     nie jest regułą per-linia; wciśnięty tutaj wymagałby opcji używanej przez
 *     jeden hook, czyli abstrakcji udającej wspólność
 *   • `check-delegation`, `check-patterns-read` — bramki blokujące (exit 2),
 *     inna natura niż doradcze skanery treści
 *   • `check-flutter-imports`, `check-context-isolation` — hooki `Stop`, czytają
 *     listę zmian z gita, a nie pojedynczy `file_path`
 */

const fs = require('fs');
const path = require('path');
const { readStdinJsonWithRaw } = require('./utils');

/** Linia będąca w całości komentarzem — w składni C/Dart/TS. */
const COMMENT_LINE_C = /^\s*(\/\/|\/\*|\*)/;
/** Linia będąca w całości komentarzem — w składni Pythona. */
const COMMENT_LINE_PY = /^\s*#/;

/** Ucina komentarz liniowy, żeby `// debugPrint(x)` nie liczyło się jako kod. */
function stripTrailingComment(line) {
  const idx = line.indexOf('//');
  return idx >= 0 ? line.slice(0, idx) : line;
}

const FINDERS = {
  flutter: () => require('./flutter-config').findFlutterConfig,
  python: () => require('./python-config').findPythonConfig,
  ddd: () => require('./ddd-config').findConfig,
};

/**
 * Dopasowanie `skipPatterns` w dwóch wariantach, które istniały w kopiach.
 * Zachowane rozdzielnie, bo NIE są równoważne: wariant pythonowy patrzy też na
 * fragment ścieżki (`__pycache__`, `.venv`), flutterowy tylko na końcówkę nazwy.
 */
const SKIP_MATCHERS = {
  flutter: (filePath, basename, pat) => filePath.endsWith(pat),
  python: (filePath, basename, pat) => basename.startsWith(pat) || basename.endsWith(pat) || filePath.includes(pat),
};

const DEFAULT_SKIP = {
  flutter: ['_test.dart', '.g.dart', '.freezed.dart', '.mock.dart'],
  python: ['test_', '_test.py', 'conftest.py', '__pycache__', '.venv'],
};

/**
 * Wypisuje znaleziska w formacie wspólnym dla hooków Flutterowych:
 * do `cap` linii `prefix basename:linia — komunikat`, potem zbiorcze „i jeszcze N",
 * na końcu opcjonalne stopki (np. namiar na wzorzec).
 *
 * @param {Array<{line: number, msg: string}>} findings
 */
function reportFindings(findings, { prefix, basename, cap = 10, footers = [] }) {
  if (!findings.length) return;
  const shown = findings.slice(0, cap);
  for (const f of shown) console.error(`${prefix} ${basename}:${f.line} — ${f.msg}`);
  if (findings.length > shown.length) {
    console.error(`${prefix} ...i jeszcze ${findings.length - shown.length} w tym pliku`);
  }
  for (const footer of footers) if (footer) console.error(footer);
}

/**
 * Uruchamia hook treściowy.
 *
 * @param {object} opts
 * @param {string|string[]} opts.extensions   końcówka(-i) pliku, np. '.dart' albo '_test.dart'
 * @param {'flutter'|'python'|'ddd'} opts.configFinder  który config projektu wczytać
 * @param {(config: object) => any} [opts.section]      zwraca sekcję configu; falsy = cisza
 * @param {RegExp[]} [opts.preSkip]           odsiew po ścieżce PRZED wczytaniem configu
 * @param {'flutter'|'python'|false} [opts.skipStyle]   wariant dopasowania `skipPatterns`
 * @param {(ctx) => boolean} [opts.scope]     true = plik w zasięgu; false = cisza
 * @param {Array<{re: RegExp, msg: string}>} [opts.rules]  reguły per-linia (skaner wbudowany)
 * @param {(ctx) => string[]} [opts.allow]    fragmenty, których obecność zwalnia linię
 * @param {(section, ctx) => object} [opts.ruleFilter]  mapa klucz-reguły → bool (włączanie z configu)
 * @param {(ctx) => void} [opts.scan]         własny skaner (gdy `rules` nie wystarcza)
 * @param {'c'|'py'} [opts.commentStyle]      składnia komentarzy dla skanera wbudowanego
 * @param {boolean} [opts.stripComments]      ucinać komentarz na końcu linii
 * @param {object} [opts.report]              parametry reportFindings dla skanera wbudowanego
 */
async function runRuleScanner(opts) {
  const { raw, parsed: input } = await readStdinJsonWithRaw();
  const done = () => { process.stdout.write(raw); process.exit(0); };

  try {
    const filePath = input.tool_input?.file_path;
    const extensions = [].concat(opts.extensions);
    if (!filePath || !extensions.some((ext) => filePath.endsWith(ext))) done();

    if (opts.preSkip && opts.preSkip.some((re) => re.test(filePath))) done();

    const findConfig = FINDERS[opts.configFinder]();
    const loaded = findConfig(filePath);
    if (!loaded) done();
    const { config } = loaded;

    const section = opts.section ? opts.section(config) : config;
    if (!section) done();

    const basename = path.basename(filePath);
    if (opts.skipStyle) {
      const patterns = config.skipPatterns || DEFAULT_SKIP[opts.skipStyle];
      const matches = SKIP_MATCHERS[opts.skipStyle];
      if (patterns.some((pat) => matches(filePath, basename, pat))) done();
    }

    const normalized = filePath.replace(/\\/g, '/');
    const scopeCtx = { filePath, normalized, basename, config, section };
    if (opts.scope && !opts.scope(scopeCtx)) done();

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) done();

    const content = fs.readFileSync(resolvedPath, 'utf8');
    const lines = content.split('\n');
    const ctx = { ...scopeCtx, content, lines };

    if (opts.scan) {
      opts.scan(ctx);
    } else {
      const commentRe = opts.commentStyle === 'py' ? COMMENT_LINE_PY : COMMENT_LINE_C;
      // Wyjątki nieszkodliwe w praktyce (np. `Colors.transparent`) — linia zawierająca
      // którykolwiek z nich nie jest w ogóle sprawdzana.
      const allow = opts.allow ? opts.allow(ctx) : [];
      // ruleFilter: mapa `klucz reguły → bool` z configu. Reguła bez włączonego
      // klucza nie jest sprawdzana (tak działał check-design-tokens: `checks`).
      const enabled = opts.ruleFilter ? opts.ruleFilter(section, ctx) : null;
      const rules = enabled ? opts.rules.filter((r) => enabled[r.key]) : opts.rules;
      const findings = [];
      for (let i = 0; i < lines.length; i++) {
        if (commentRe.test(lines[i])) continue;
        const line = opts.stripComments ? stripTrailingComment(lines[i]) : lines[i];
        if (allow.length && allow.some((a) => line.includes(a))) continue;
        for (const rule of rules) {
          if (rule.re.test(line)) {
            findings.push({ line: i + 1, msg: rule.msg });
            break; // jedno zgłoszenie na linię wystarczy
          }
        }
      }
      reportFindings(findings, { basename, ...(opts.report || {}) });
    }
  } catch {
    // Nieprawidłowe wejście albo nieczytelny plik — przepuść bez zmian
  }

  done();
}

module.exports = {
  runRuleScanner,
  reportFindings,
  stripTrailingComment,
  COMMENT_LINE_C,
  COMMENT_LINE_PY,
};
