#!/usr/bin/env node
// scripts/orchestrate-tree-hash.mjs — hash drzewa roboczego i sprawdzenie, czy werdykt nadal go dotyczy
// (ORC-139, TASK-GSTACK-ADOPT-001 / A2).
//
// Dlaczego osobny skrypt: sonda hasha w Workflow biegnie przez cache silnika i model uruchamiający
// polecenie. Krok 4 `/orchestrate` potrzebuje sprawdzenia, które tego nie ma: zwykły Node, to samo
// polecenie (`treeHashCmd` z orchestrate-core, jedno źródło), wynik z kodu wyjścia.
//
// Użycie:
//   node scripts/orchestrate-tree-hash.mjs [--project <dir>] [--exclude <ścieżka>]... [--json]
//        → wypisuje hash drzewa (jedna linia)
//   node scripts/orchestrate-tree-hash.mjs --check <hash> [--project <dir>] [--exclude <ścieżka>]... [--json]
//        → porównuje <hash> z bieżącym drzewem
//
// `--exclude` dokłada ścieżki względem korzenia repo do wbudowanych (artefakty silnika). Podaj plik analizy
// i taska (`report.treeHash.excludes` ma pełną listę użytą przez przebieg).
//
// Kody wyjścia:
//   0  hash wypisany albo --check: drzewo zgodne z hashem (fresh), albo hash pusty / "-"
//      (artefakt sprzed ORC-139 — OSTRZEŻENIE na stderr, nie błąd)
//   1  błąd użycia, git nie policzył hasha albo --check dostał napis, który nie jest hashem obiektu gita
//   2  --check: drzewo różni się od hasha — werdykt NIEAKTUALNY

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import core from './workflow/orchestrate-core.mjs';

const USAGE = 'użycie: orchestrate-tree-hash.mjs [--check <hash>] [--project <dir>] [--exclude <ścieżka>]... [--json]';

export function parseArgs(argv) {
  const out = { project: process.cwd(), excludes: [], check: undefined, json: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const need = () => {
      if (i + 1 >= argv.length) throw new Error(`${k}: brak wartości`);
      return argv[++i];
    };
    if (k === '--project') out.project = resolve(need());
    else if (k === '--exclude') out.excludes.push(need());
    else if (k === '--check') out.check = need();
    else if (k === '--json') out.json = true;
    else throw new Error(`nieznany argument: ${k}`);
  }
  return out;
}

export function currentTreeHash(project, extraExcludes = []) {
  const excludes = core.treeHashExcludes({ treeHashExclude: extraExcludes });
  // Pominięte wykluczenie (zły znak w ścieżce) = więcej plików w haszu = fałszywe „nieaktualne", nigdy „aktualne".
  const dropped = extraExcludes.filter((p) => !excludes.includes(String(p).replace(/^\.\//, '').replace(/\/+$/, '')));
  const raw = execFileSync('bash', ['-c', core.treeHashCmd(excludes)], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const hash = core.parseTreeHash(raw);
  if (!hash) throw new Error(`git nie zwrócił poprawnego hasha drzewa (wyjście: ${JSON.stringify(raw.trim().slice(0, 80))})`);
  return { hash, excludes, dropped };
}

export function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`${e.message}\n${USAGE}`);
    return 1;
  }
  let cur;
  try {
    cur = currentTreeHash(args.project, args.excludes);
  } catch (e) {
    console.error(`orchestrate-tree-hash: ${String(e.stderr || e.message).trim()}`);
    return 1;
  }
  for (const p of cur.dropped) console.error(`UWAGA: wykluczenie "${p}" pominięte (niedozwolony znak) — hash obejmuje ten plik`);

  if (args.check === undefined) {
    console.log(args.json ? JSON.stringify({ hash: cur.hash, excludes: cur.excludes }) : cur.hash);
    return 0;
  }
  const verdict = core.treeBinding(args.check === '-' ? undefined : args.check, cur.hash);
  if (args.json) console.log(JSON.stringify({ ...verdict, current: cur.hash }));
  if (verdict.state === 'fresh') {
    if (!args.json) console.log(`ZGODNE ${cur.hash}`);
    return 0;
  }
  if (verdict.state === 'stale') {
    console.error(`NIEAKTUALNE: ${verdict.reason}`);
    return 2;
  }
  if (verdict.state === 'unknown') {
    // hash podany, ale nie ma kształtu hasha obiektu gita — to błąd danych, nie brak pola
    console.error(`BŁĄD: ${verdict.warning}`);
    return 1;
  }
  // missing: brak pola hash w artefakcie to ostrzeżenie (zgodność wsteczna), nie błąd.
  console.error(`OSTRZEŻENIE: ${verdict.warning}`);
  return 0;
}

// Uruchomienie bezpośrednie (także przez symlink i ścieżkę ze spacją): porównanie realnych ścieżek, nie adresów URL.
// Porównanie URL-i dawało CICHY exit 0 bez żadnego wyjścia — a krok 4 czyta exit 0 jako „zgodne".
function isDirectRun() {
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isDirectRun()) process.exitCode = main(process.argv.slice(2));
