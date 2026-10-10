#!/usr/bin/env node
// scripts/generate-inbox-index.mjs — docs/tasks/_inbox/index.json z nagłówków rekordów skrzynki.
//
// Skrzynka zostaje markdownem (edycja w triage), a dashboard i serwer czytają ten jeden plik.
// Pozycja: id, status, trigger, category, sources, occurrences, projects, first_seen, last_seen.
// Rekord bez `category` dostaje defaultCategory(trigger). Plik niesie znacznik GENERATED.
//
// Użycie:
//   node scripts/generate-inbox-index.mjs            # przelicza i zapisuje index.json
//   node scripts/generate-inbox-index.mjs --check    # nic nie zapisuje; exit 1, gdy index.json nieaktualny
//   node scripts/generate-inbox-index.mjs --dir <katalog>   # inna skrzynka (testy)
//
// Zapis idzie do `--dir`, więc ręczna edycja index.json jest nadpisywana, a `--check` ją wykrywa.
// Rekordy skrzynki są nietrackowane, dopóki człowiek ich nie przetriage'uje (report-deviation nie
// stage'uje) — index.json w gicie zmienia się razem z nimi i trafia do commita przy triage.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INBOX_DIR, INDEX_FILE, buildIndex, readInboxEntries, serializeIndex } from './lib/inbox.mjs';

function die(msg) {
  process.stderr.write(`✘ generate-inbox-index: ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
let dir = INBOX_DIR;
let check = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--check') check = true;
  else if (args[i] === '--dir') dir = args[++i] || die('--dir wymaga katalogu');
  else die(`nieznany przełącznik: ${args[i]}`);
}

const target = join(dir, INDEX_FILE);
const text = serializeIndex(buildIndex(readInboxEntries(dir)));
const current = existsSync(target) ? readFileSync(target, 'utf8') : null;

if (check) {
  if (current !== text) die(`${INDEX_FILE} ${current === null ? 'nie istnieje' : 'jest nieaktualny albo edytowany ręcznie'} — odtwórz: node scripts/generate-inbox-index.mjs`);
  console.log(`generate-inbox-index --check: ${INDEX_FILE} aktualny`);
} else if (current === text) {
  console.log(`generate-inbox-index: ${INDEX_FILE} bez zmian`);
} else {
  writeFileSync(target, text);
  console.log(`generate-inbox-index: zapisano ${INDEX_FILE}`);
}
