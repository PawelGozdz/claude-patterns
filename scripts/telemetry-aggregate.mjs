#!/usr/bin/env node
// scripts/telemetry-aggregate.mjs — agregaty dzienne zdarzeń telemetrii v1 (ADR 0012, krok 5).
//
// Czyta telemetry/events/*.jsonl (poza gitem, per maszyna) i zapisuje telemetry/rollups/
// <projekt>/<RRRR-MM-DD>.<host>.json (w gicie). Dashboard i serwer czytają te małe pliki zamiast
// kilkunastu tysięcy surowych zdarzeń. Plik jest per host, bo surowe zdarzenia nie scalają się
// między maszynami, a percentyle nie dają się sumować — liczniki scala odbiorca.
//
// Użycie:
//   node scripts/telemetry-aggregate.mjs               # wszystkie dni
//   node scripts/telemetry-aggregate.mjs --since 2026-10-01
//   node scripts/telemetry-aggregate.mjs --day 2026-10-10
//   node scripts/telemetry-aggregate.mjs --check       # nic nie zapisuje; exit 1, gdy plik nieaktualny
//
// Idempotentny: przeliczenie dnia nadpisuje jego plik, a niezmieniony plik zostaje nietknięty.
// Cron: po codziennym audycie floty (ADR 0012). Exit: 0 = ok, 1 = błąd użycia/zapisu albo --check
// wykrył rozjazd.

import fs from 'node:fs';
import path from 'node:path';
import { eventsDir, readEvents, rollupsDir } from './lib/telemetry-events.mjs';
import { buildRollups, serializeRollup } from './lib/telemetry-rollup.mjs';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_NAME = /^[A-Za-z0-9._-]{1,80}$/;

function die(msg) {
  process.stderr.write(`✘ telemetry-aggregate: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { day: null, since: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') out.check = true;
    else if (a === '--day' || a === '--since') {
      const v = argv[++i] ?? '';
      if (!DAY.test(v)) die(`${a} wymaga daty RRRR-MM-DD, dostałem "${v}"`);
      out[a.slice(2)] = v;
    } else die(`nieznany przełącznik: ${a}`);
  }
  if (out.day && out.since) die('--day i --since wykluczają się');
  return out;
}

function loadEvents() {
  const dir = eventsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()
    .flatMap((f) => readEvents(path.join(dir, f)));
}

const selected = (day, opts) => (opts.day ? day === opts.day : opts.since ? day >= opts.since : true);

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rollups = buildRollups(loadEvents());
  const root = rollupsDir();
  const stats = { written: 0, unchanged: 0, stale: 0 };

  for (const r of [...rollups.values()].sort((a, b) => `${a.project}${a.day}${a.host}`.localeCompare(`${b.project}${b.day}${b.host}`))) {
    if (!selected(r.day, opts)) continue;
    if (!SAFE_NAME.test(r.project) || !SAFE_NAME.test(r.host)) continue; // nazwa pliku z danych — tylko bezpieczne znaki
    const file = path.join(root, r.project, `${r.day}.${r.host}.json`);
    const text = serializeRollup(r);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === text) { stats.unchanged++; continue; }
    if (opts.check) { stats.stale++; process.stderr.write(`✘ nieaktualny: ${path.relative(root, file)}\n`); continue; }
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      stats.written++;
    } catch (e) {
      die(`zapis ${path.relative(root, file)} nieudany: ${e.message}`);
    }
  }

  if (opts.check) {
    if (stats.stale) die(`${stats.stale} agregatów nieaktualnych — uruchom: node scripts/telemetry-aggregate.mjs`);
    console.log(`telemetry-aggregate --check: ${stats.unchanged} agregatów aktualnych`);
    return;
  }
  console.log(`telemetry-aggregate: zapisano ${stats.written}, bez zmian ${stats.unchanged}`);
}

main();
