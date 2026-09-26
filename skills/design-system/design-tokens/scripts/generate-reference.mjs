#!/usr/bin/env node
// Generuje reference/tokens.md — pełną listę tokenów obu systemów (tooling, product)
// z WYNIKU buildu repo design-system, a nie z pamięci.
//
//   node generate-reference.mjs [--design-system <ścieżka>] [--check]
//
// Źródło prawdy to design-system/tokens/*.json. Czytamy jednak packages/tokens/dist/,
// bo dopiero tam są wartości rozwiązane (tryb ciemny, ink/solid/onSolid liczone przez
// palette.ts) i DOKŁADNE nazwy, których używa kod aplikacji (`--ds-*`, klasy Tailwinda,
// eksporty antd). Parsowanie JSON-ów wymagałoby powielenia resolvera z
// design-system/scripts/lib — a to jest dokładnie ten rozjazd, któremu skill ma zapobiegać.
//
// --check: nie zapisuje, kończy się kodem 1, gdy plik w repo różni się od wygenerowanego
// (np. po `pnpm build` w design-system bez odświeżenia tej listy).

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'reference', 'tokens.md');
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dsRoot = resolve(
  argValue('--design-system') ?? process.env.DESIGN_SYSTEM_PATH ?? join(REPO_ROOT, '..', 'design-system'),
);
const dist = join(dsRoot, 'packages', 'tokens', 'dist');
if (!existsSync(join(dist, 'tooling.css'))) {
  console.error(`Brak ${join(dist, 'tooling.css')} — podaj --design-system <ścieżka> i uruchom tam \`pnpm build\`.`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(dsRoot, 'packages', 'tokens', 'package.json'), 'utf8'));

/** Zmienne CSS z bloku `selector { ... }` jako Map nazwa → wartość (bez kanałów `--ds-rgb-*`). */
function cssBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return new Map();
  const body = css.slice(start, css.indexOf('}', start));
  const vars = new Map();
  for (const m of body.matchAll(/(--ds-[a-z0-9-]+):\s*([^;]+);/g)) {
    if (!m[1].startsWith('--ds-rgb-')) vars.set(m[1], m[2].trim());
  }
  return vars;
}

function readSystem(name) {
  const css = readFileSync(join(dist, `${name}.css`), 'utf8');
  return { light: cssBlock(css, ':root'), dark: cssBlock(css, '[data-theme="dark"]') };
}

const systems = { tooling: readSystem('tooling'), product: readSystem('product') };

const GROUPS = [
  ['Kolor', /^--ds-color-/],
  ['Typografia', /^--ds-(font|type)-/],
  ['Odstępy', /^--ds-space-/],
  ['Promienie', /^--ds-radius-/],
  ['Cienie', /^--ds-shadow-/],
  ['Rozmiary', /^--ds-size-/],
  ['Punkty przełamania', /^--ds-breakpoint-/],
  ['Ruch', /^--ds-motion-/],
];

const allNames = [...new Set([...systems.tooling.light.keys(), ...systems.product.light.keys()])];
const cell = (v) => (v === undefined ? '—' : `\`${v}\``);

const sections = GROUPS.map(([title, re]) => {
  const names = allNames.filter((n) => re.test(n));
  if (!names.length) return '';
  const rows = names.map((n) => `| \`${n}\` | ${cell(systems.tooling.light.get(n))} | ${cell(systems.tooling.dark.get(n))} | ${cell(systems.product.light.get(n))} | ${cell(systems.product.dark.get(n))} |`);
  return `## ${title}\n\n| Zmienna CSS | tooling | tooling (dark) | product | product (dark) |\n|---|---|---|---|---|\n${rows.join('\n')}\n`;
}).filter(Boolean);

const antd = readFileSync(join(dist, 'antd.ts'), 'utf8');
const antdExports = [...antd.matchAll(/export const (\w+): ThemeConfig/g)].map((m) => m[1]);
const tailwind = readFileSync(join(dist, 'tailwind.ts'), 'utf8');
const presets = [...tailwind.matchAll(/export const (\w+Preset)/g)].map((m) => m[1]);
// Tylko pierwszy blok "colors" (preset tooling; product ma identyczne nazwy) — bez fontFamily/boxShadow.
const colorsStart = tailwind.indexOf('"colors": {');
const colorsBlock = tailwind.slice(colorsStart, tailwind.indexOf('}', colorsStart));
const twColors = [...new Set([...colorsBlock.matchAll(/^\s*"([a-z-]+)": "(?:rgb\()?var\(--ds-/gm)].map((m) => m[1]))];
const appCss = readdirSync(join(dist, 'apps')).filter((f) => f.endsWith('.css')).map((f) => f.replace(/\.css$/, ''));
const code = (list) => list.map((e) => `\`${e}\``).join(', ');

const describeExport = (key) => {
  if (key === '.') return 'obiekty `brand`, `tooling`, `product`, `apps` (TS)';
  if (key === './antd') return `motywy antd: ${code(antdExports)}`;
  if (key === './tailwind') return `presety Tailwind 3: ${code(presets)}`;
  if (key.startsWith('./tailwind4/')) return 'Tailwind 4: zmienne `--ds-*` + `@theme`';
  return 'CSS ze zmiennymi `--ds-*` (oba motywy)';
};
const exportRows = Object.keys(pkg.exports)
  .map((k) => `| \`${pkg.name}${k === '.' ? '' : k.slice(1)}\` | ${describeExport(k)} |`)
  .join('\n');

const md = `<!-- GENEROWANE przez skills/design-system/design-tokens/scripts/generate-reference.mjs
     z design-system/packages/tokens/dist (paczka ${pkg.name}@${pkg.version}).
     Nie edytuj ręcznie — zmień tokens/*.json w design-system, \`pnpm build\`, potem uruchom generator. -->

# Tokeny — pełna lista (${pkg.name}@${pkg.version})

Wartości: jasny motyw i ciemny motyw (\`data-theme="dark"\` na \`<html>\`). „—” = token nie
istnieje w danym systemie albo nie zmienia się w trybie ciemnym.

${sections.join('\n')}
## Wejścia paczki

| Import | Co daje |
|---|---|
${exportRows}

Aplikacje z własnym CSS (\`css/apps/<nazwa>\`): ${code(appCss)}.

## Klasy kolorów Tailwinda

Presety mapują kolory na zmienne CSS, więc klasa działa w obu motywach. Nazwy (z prefiksem
\`bg-\`, \`text-\`, \`border-\` itd.): ${code(twColors)}.
`;

if (args.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== md) {
    console.error('reference/tokens.md jest nieaktualny — uruchom generate-reference.mjs bez --check.');
    process.exit(1);
  }
  console.log('reference/tokens.md aktualny.');
} else {
  writeFileSync(OUT, md);
  console.log(`Zapisano ${OUT} (${allNames.length} zmiennych, ${pkg.name}@${pkg.version}).`);
}
