#!/usr/bin/env node
// scripts/telemetry-export.mjs — paczka agregatów do wysyłki na serwer zespołu (TASK-OBS-008, ADR 0012).
//
//   node scripts/telemetry-export.mjs [--since 2026-10-01] [--host <id>] [--out plik.json]
//   node scripts/telemetry-export.mjs --check      # tylko walidacja: exit 1, gdy paczka niesie coś podejrzanego
//
// Wypisuje paczkę (JSON) na stdout albo do pliku; podsumowanie idzie na stderr. NIC nie wysyła:
// transport zależy od adresu serwera, którego jeszcze nie ma — ten skrypt jest kontraktem po stronie
// nadawcy. Odbiorca robi upsert po `rollups[].id`, więc ponowna wysyłka niczego nie dubluje.
//
// Exit: 0 = paczka zbudowana i czysta; 1 = `findLeaks` coś znalazł (paczka NIE jest wypisywana).

import fs from 'node:fs';
import { buildBatch } from './lib/telemetry-export.mjs';

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const since = opt('since');
if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  process.stderr.write('✘ telemetry-export: --since oczekuje RRRR-MM-DD\n');
  process.exit(1);
}

const { batch, dropped, leaks } = buildBatch({ since, host: opt('host') });
const note = (msg) => process.stderr.write(`${msg}\n`);

if (leaks.length) {
  note(`✘ telemetry-export: ${leaks.length} podejrzanych wartości w paczce — nic nie wypisano:`);
  leaks.slice(0, 10).forEach((l) => note(`    ${l}`));
  process.exit(1);
}
if (dropped.length) note(`ℹ pominięto ${dropped.length} pól spoza białej listy (np. ${dropped.slice(0, 3).join(', ')})`);
note(`✔ paczka: ${batch.rollups.length} agregatów, hosty: ${batch.hosts.join(', ') || '—'}`);

if (argv.includes('--check')) process.exit(0);
const json = `${JSON.stringify(batch)}\n`;
const out = opt('out');
if (out) { fs.writeFileSync(out, json); note(`zapisano ${out} (${json.length} B)`); } else process.stdout.write(json);
