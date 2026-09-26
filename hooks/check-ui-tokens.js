#!/usr/bin/env node
/**
 * PostToolUse Hook: ESLint z regułami designu na zapisanym pliku UI (.ts/.tsx w src/)
 *
 * DLACZEGO: literał koloru czy margines „na chwilę” wpisany w komponent przechodzi review,
 * bo w swoim pliku wygląda niewinnie. Po miesiącach aplikacja ma trzy odcienie tła.
 * Ten hook łapie to w momencie zapisu, nie po godzinie w CI. Odpowiednik
 * check-design-tokens.js (Dart) dla React/TypeScript. Rejestruje go blok `design-system`
 * (ADR 0010), więc działa tylko w projektach, które ten blok włączyły.
 *
 * JAK: uruchamia ESLINT PROJEKTU (jego konfigurację, parser, pluginy) na jednym pliku i
 * dokłada przez `--rule` reguły designu na regułach wbudowanych ESLinta, bez żadnego
 * pluginu do instalowania:
 *   - no-restricted-syntax: literały hex/rgb()/hsl() w stringach i template stringach,
 *     `style={{…}}` z właściwością spoza whitelisty pozycjonowania, liczby spoza skali
 *     odstępów w propsach `gap`/`size`/`gutter`
 *   - no-restricted-imports: `antd/es|lib/<komponent>/style` (ręczne nadpisanie stylów)
 * Zgłaszane są wyłącznie komunikaty z prefiksem [design]. Pozostałe błędy lintu są
 * sprawą `lint:check` projektu, nie tego hooka.
 *
 * Skrypt `.bin/eslint` jest wołany bezpośrednio (nie `node eslint.js`): shim pnpm ustawia
 * NODE_PATH na node_modules/.pnpm/node_modules, bez czego konfiguracja projektu nie znajduje
 * pluginów (zweryfikowane na marketing-hub 2026-09-26: `eslint-plugin-prettier`).
 *
 * KANAŁ ZWROTNY: przy exit 0 Claude Code NIE pokazuje modelowi stderr hooka PostToolUse
 * (trafia tylko do logu debug) — https://code.claude.com/docs/en/hooks.md. Dlatego
 * znaleziska idą na stdout jako JSON `hookSpecificOutput.additionalContext`. Kod wyjścia
 * ZAWSZE 0 — hook doradza, nigdy nie blokuje.
 *
 * Zasięg (cisza poza nim): `.ts`/`.tsx` z `/src/` w ścieżce, bez testów (`.spec.`, `.test.`,
 * `.stories.`, `.d.ts`), w pakiecie z zależnością UI (react/antd/@refinedev/core/vue/svelte)
 * i z lokalnym ESLintem. Brak ESLinta = cisza (nic nie pobieramy z sieci).
 * Wyłączenie: UI_TOKENS_MODE=off.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readStdinJsonWithRaw } = require('./lib/utils');

const UI_DEPS = ['react', 'antd', '@refinedev/core', 'vue', 'svelte', 'preact'];
const SKIP = /\.(spec|test|stories)\.[tj]sx?$|\.d\.ts$/;
const SPACE_SCALE = '0|4|8|10|12|14|16|20|24';
const STYLE_WHITELIST = [
  'position', 'top', 'right', 'bottom', 'left', 'inset',
  'transform', 'transformOrigin',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'zIndex', 'display', 'visibility', 'opacity', 'overflow', 'overflowX', 'overflowY',
  'cursor', 'pointerEvents', 'order',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'flexDirection', 'flexWrap',
  'alignItems', 'alignSelf', 'justifyContent', 'justifySelf',
  'gridArea', 'gridColumn', 'gridRow', 'gridTemplateColumns', 'gridTemplateRows',
];
const HEX = '(^|[\\s(,])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b';
const TOKENS_HINT = 'skill design-tokens (reference/tokens.md)';

const DESIGN_SYNTAX = [
  'error',
  { selector: `Literal[value=/${HEX}/]`, message: `[design] literał koloru hex — użyj tokena: ${TOKENS_HINT}` },
  { selector: `TemplateElement[value.raw=/${HEX}/]`, message: `[design] literał koloru hex w template stringu — użyj tokena: ${TOKENS_HINT}` },
  { selector: 'Literal[value=/\\b(rgba?|hsla?)\\(/]', message: `[design] kolor rgb()/hsl() — użyj tokena: ${TOKENS_HINT}` },
  { selector: 'TemplateElement[value.raw=/\\b(rgba?|hsla?)\\(/]', message: `[design] kolor rgb()/hsl() w template stringu — użyj tokena: ${TOKENS_HINT}` },
  {
    selector: `JSXAttribute[name.name="style"] > JSXExpressionContainer > ObjectExpression > Property > Identifier.key:not([name=/^(${STYLE_WHITELIST.join('|')})$/])`,
    message: '[design] style={{…}} dopuszcza tylko pozycjonowanie/rozmiar (whitelista w skillu design-tokens) — kolor, odstęp, typografię i obramowanie bierz z komponentu lub tokena',
  },
  {
    selector: `JSXAttribute[name.name=/^(gap|size|gutter)$/] Literal[raw=/^(?!(${SPACE_SCALE})$)[0-9]+$/]`,
    message: `[design] odstęp spoza skali (${SPACE_SCALE.split('|').join(', ')}) — użyj tokena odstępu albo rozmiaru nazwanego`,
  },
];
const DESIGN_IMPORTS = [
  'error',
  { patterns: [{ group: ['antd/es/*/style', 'antd/lib/*/style'], message: '[design] nie nadpisuj stylów komponentów antd — wariant komponentu albo token w paczce tokenów' }] },
];

/** Najbliższy katalog w górę (max 20 poziomów), który spełnia `test`. */
function findUp(start, test) {
  let dir = start;
  for (let depth = 0; depth < 20; depth++) {
    if (test(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function isUiPackage(pkgDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    return UI_DEPS.some((d) => d in deps);
  } catch {
    return false;
  }
}

function eslintBin(fromDir) {
  const bin = process.platform === 'win32' ? 'eslint.cmd' : 'eslint';
  const dir = findUp(fromDir, (d) => fs.existsSync(path.join(d, 'node_modules', '.bin', bin)));
  return dir ? path.join(dir, 'node_modules', '.bin', bin) : null;
}

/** Uruchamia ESLint; zwraca listę { line, column, message } z prefiksem [design] albo null przy awarii. */
function runDesignLint(bin, cwd, file) {
  const args = [
    '--format', 'json', '--no-color',
    '--rule', `no-restricted-syntax: ${JSON.stringify(DESIGN_SYNTAX)}`,
    '--rule', `no-restricted-imports: ${JSON.stringify(DESIGN_IMPORTS)}`,
    file,
  ];
  let stdout;
  try {
    stdout = execFileSync(bin, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  } catch (err) {
    // ESLint kończy się kodem 1, gdy znajdzie błędy — to normalna ścieżka, wynik jest w stdout.
    stdout = err.stdout || '';
    if (!stdout.trim().startsWith('[')) return null;
  }
  try {
    const [result] = JSON.parse(stdout);
    return (result?.messages ?? [])
      .filter((m) => typeof m.message === 'string' && m.message.includes('[design]'))
      .map((m) => ({ line: m.line, column: m.column, message: m.message.slice(m.message.indexOf('[design]') + 9) }));
  } catch {
    return null;
  }
}

function emit(context) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context } }));
}

async function main() {
  const { parsed: input } = await readStdinJsonWithRaw();
  try {
    if (process.env.UI_TOKENS_MODE === 'off') return;
    const filePath = input?.tool_input?.file_path;
    if (!filePath || !/\.tsx?$/.test(filePath) || SKIP.test(filePath)) return;
    const resolved = path.resolve(input.cwd || process.cwd(), filePath);
    if (!resolved.replace(/\\/g, '/').includes('/src/') || !fs.existsSync(resolved)) return;

    const pkgDir = findUp(path.dirname(resolved), (d) => fs.existsSync(path.join(d, 'package.json')));
    if (!pkgDir || !isUiPackage(pkgDir)) return;
    const bin = eslintBin(pkgDir);
    if (!bin) return;

    const findings = runDesignLint(bin, pkgDir, resolved);
    if (!findings || findings.length === 0) return;

    const name = path.relative(pkgDir, resolved);
    // Kolumna odróżnia dwa naruszenia w tej samej linii (np. `color` i `marginTop` w jednym style).
    const shown = findings.slice(0, 10).map((f) => `- ${name}:${f.line}:${f.column} — ${f.message}`);
    if (findings.length > shown.length) shown.push(`- …i jeszcze ${findings.length - shown.length} w tym pliku`);
    emit(
      `[check-ui-tokens] Naruszenia systemu designu w ${name} (${findings.length}):\n${shown.join('\n')}\n` +
      'Popraw przed dalszą pracą: wartości z tokenów (skill design-tokens), układ wg skilla ui-patterns.',
    );
  } catch {
    // Doradczy hook: żaden błąd wewnętrzny nie może przerwać pracy agenta.
  } finally {
    process.exit(0);
  }
}

main();
