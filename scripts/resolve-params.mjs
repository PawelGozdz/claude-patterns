#!/usr/bin/env node
// Rozwija parametry ścieżkowe z globami (np. governance.canon) w chwili WYWOŁANIA.
//   node scripts/resolve-params.mjs <project_dir> [--block governance] [--param canon]
//
// Po co: `runtime.yml → params` to migawka z chwili setupu. Nowy BDR dodany po setupie nie
// wchodził do kanonu /analyze aż do następnego setupu (juz-ide-api-2, BDR-090, 2026-10-21).
// /analyze woła ten skrypt w kroku 0.d (ANL-042) i używa pola `live` jako korpusu.
//
// Wyjście: JSON na stdout — { project, params: [{ block, param, patterns, live, snapshot,
// added, removed, drift, error }] }. Exit 0 także przy rozjeździe (to informacja, nie błąd);
// exit 1 przy błędzie użycia / braku runtime.yml; exit 2, gdy któryś wzorzec nie rozwija się
// wcale (pusty glob, brak pliku) — korpus pusty to nie „brak zmian", analiza ma wtedy STOP.

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveGlobParams } from './lib/param-drift.mjs';

const YAML = (await import('yaml')).default;
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const flagValues = new Set([flag('--block'), flag('--param')].filter(Boolean));
const [projectArg] = argv.filter((a) => !a.startsWith('--') && !flagValues.has(a));
if (!projectArg) {
  console.error('użycie: resolve-params.mjs <project_dir> [--block <blok>] [--param <param>]');
  process.exit(1);
}
const projectDir = resolve(projectArg);
const rtPath = join(projectDir, '.claude/config/runtime.yml');
if (!existsSync(rtPath)) { console.error(`BŁĄD: brak ${rtPath}`); process.exit(1); }

const rt = YAML.parse(readFileSync(rtPath, 'utf8')) ?? {};
const params = resolveGlobParams(projectDir, rt, { block: flag('--block'), param: flag('--param') });
console.log(JSON.stringify({ project: projectDir, params }, null, 2));
process.exit(params.some((p) => p.error) ? 2 : 0);
